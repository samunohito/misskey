/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { Meilisearch } from 'meilisearch';
import { MiMeta } from '@/models/Meta.js';
import { Config, loadConfig } from '@/config.js';
import { createPostgresDataSource } from '@/postgres.js';
import { allSettled } from '@/misc/promise-tracker.js';
import { GlobalEvents } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import type { Disposable } from './disposable-registry.js';
import { DisposableRegistry } from './disposable-registry.js';
import type { DependencyContainer } from 'tsyringe';

// 旧 GlobalModule のグローバルリソース (config / db / redis / meilisearch / meta) を context container に登録する。
// 各 context (server / jobQueue / cli) の `composeXxxContainer()` から必ず最初に呼び出す。
export async function registerGlobals(c: DependencyContainer): Promise<void> {
	const config = loadConfig();
	c.register<Config>(DI.config, { useValue: config });

	const db = createPostgresDataSource(config);
	await db.initialize();
	c.register<DataSource>(DI.db, { useValue: db });

	const redis = new Redis.Redis(config.redis);
	const redisForPub = new Redis.Redis(config.redisForPubsub);
	const redisForSub = new Redis.Redis(config.redisForPubsub);
	redisForSub.subscribe(config.host);
	const redisForTimelines = new Redis.Redis(config.redisForTimelines);
	const redisForReactions = new Redis.Redis(config.redisForReactions);
	c.register<Redis.Redis>(DI.redis, { useValue: redis });
	c.register<Redis.Redis>(DI.redisForPub, { useValue: redisForPub });
	c.register<Redis.Redis>(DI.redisForSub, { useValue: redisForSub });
	c.register<Redis.Redis>(DI.redisForTimelines, { useValue: redisForTimelines });
	c.register<Redis.Redis>(DI.redisForReactions, { useValue: redisForReactions });

	const meilisearch =
		config.fulltextSearch?.provider === 'meilisearch'
			? (() => {
				if (!config.meilisearch) {
					throw new Error('Meilisearch is enabled but no configuration is provided');
				}
				return new Meilisearch({
					host: `${config.meilisearch.ssl ? 'https' : 'http'}://${config.meilisearch.host}:${config.meilisearch.port}`,
					apiKey: config.meilisearch.apiKey,
				});
			})()
			: null;
	c.register<Meilisearch | null>(DI.meilisearch, { useValue: meilisearch });

	const meta = await loadMeta(db, redisForSub);
	c.register<MiMeta>(DI.meta, { useValue: meta });

	// DisposableRegistry を context container に登録し、グローバルリソースの cleanup を登録する。
	c.registerSingleton(DisposableRegistry);
	const registry = c.resolve(DisposableRegistry);
	registry.register(new GlobalResourcesDisposable(db, [redis, redisForPub, redisForSub, redisForTimelines, redisForReactions]));
}

async function loadMeta(db: DataSource, redisForSub: Redis.Redis): Promise<MiMeta> {
	const meta = await db.transaction(async transactionalEntityManager => {
		// 過去のバグでレコードが複数出来てしまっている可能性があるので新しいIDを優先する
		const metas = await transactionalEntityManager.find(MiMeta, {
			order: {
				id: 'DESC',
			},
		});

		const first = metas[0];
		if (first) return first;

		// metaが空のときfetchMetaが同時に呼ばれるとここが同時に呼ばれてしまうことがあるのでフェイルセーフなupsertを使う
		return transactionalEntityManager
			.upsert(MiMeta, { id: 'x' }, ['id'])
			.then((x) => transactionalEntityManager.findOneByOrFail(MiMeta, x.identifiers[0]));
	});

	redisForSub.on('message', (_: string, data: string) => {
		const obj = JSON.parse(data);
		if (obj.channel !== 'internal') return;
		const { type, body } = obj.message as GlobalEvents['internal']['payload'];
		if (type === 'metaUpdated') {
			for (const key in body.after) {
				(meta as unknown as Record<string, unknown>)[key] = (body.after as Record<string, unknown>)[key];
			}
			meta.rootUser = null; // joinなカラムは通常取ってこないので
		}
	});

	return meta;
}

class GlobalResourcesDisposable implements Disposable {
	constructor(
		private db: DataSource,
		private redises: Redis.Redis[],
	) {}

	async dispose(): Promise<void> {
		// 進行中の DB クエリを待ってから切断する
		await allSettled();
		await Promise.all([
			this.db.destroy(),
			...this.redises.map((r) => r.disconnect()),
		]);
	}
}
