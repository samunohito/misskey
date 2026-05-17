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
import { DisposableRegistry } from './disposable-registry.js';
import type { DependencyContainer } from 'tsyringe';

// グローバル resource は process 内 singleton として持つ。
// 旧 NestJS では GlobalModule (`@Global()`) が同一プロセス内で 1 つの provider 群を共有していた。
// tsyringe で context container を複数作るケース (test, server+jobQueue 共存 etc.) でも、
// DataSource を 2 回 initialize すると `synchronize: true` 時に `pg_type_typname_nsp_index` で
// 衝突するため、ここでは module-level に cache してすべての context で同じ resource を使う。
//
// dispose は SIGTERM/SIGINT 受信時に `disposeGlobalResources()` を明示的に呼ぶこと
// (`boot/common.ts` で実装)。test の `DisposableRegistry.disposeAll()` ではここの resource は破棄しない。

interface GlobalResources {
	config: Config;
	db: DataSource;
	redis: Redis.Redis;
	redisForPub: Redis.Redis;
	redisForSub: Redis.Redis;
	redisForTimelines: Redis.Redis;
	redisForReactions: Redis.Redis;
	meilisearch: Meilisearch | null;
	meta: MiMeta;
}

let cached: GlobalResources | null = null;
let buildPromise: Promise<GlobalResources> | null = null;

async function buildGlobalResources(): Promise<GlobalResources> {
	const config = loadConfig();

	const db = createPostgresDataSource(config);
	await db.initialize();

	const redis = new Redis.Redis(config.redis);
	const redisForPub = new Redis.Redis(config.redisForPubsub);
	const redisForSub = new Redis.Redis(config.redisForPubsub);
	redisForSub.subscribe(config.host);
	const redisForTimelines = new Redis.Redis(config.redisForTimelines);
	const redisForReactions = new Redis.Redis(config.redisForReactions);

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

	const meta = await loadMeta(db, redisForSub);

	return { config, db, redis, redisForPub, redisForSub, redisForTimelines, redisForReactions, meilisearch, meta };
}

async function getGlobalResources(): Promise<GlobalResources> {
	if (cached !== null) return cached;
	// 並列で呼ばれた場合に多重 initialize しないように pending Promise を共有する。
	if (buildPromise === null) {
		buildPromise = buildGlobalResources().then((g) => {
			cached = g;
			buildPromise = null;
			return g;
		}, (e) => {
			buildPromise = null;
			throw e;
		});
	}
	return buildPromise;
}

// 旧 GlobalModule のグローバルリソース (config / db / redis / meilisearch / meta) を context container に登録する。
// 各 context (server / jobQueue / cli) の `composeXxxContainer()` から必ず最初に呼び出す。
//
// 同一プロセスで複数回呼ばれる場合 (test, server+jobQueue 共存) は cache を再利用する。
export async function registerGlobals(c: DependencyContainer): Promise<void> {
	const g = await getGlobalResources();

	c.register<Config>(DI.config, { useValue: g.config });
	c.register<DataSource>(DI.db, { useValue: g.db });
	c.register<Redis.Redis>(DI.redis, { useValue: g.redis });
	c.register<Redis.Redis>(DI.redisForPub, { useValue: g.redisForPub });
	c.register<Redis.Redis>(DI.redisForSub, { useValue: g.redisForSub });
	c.register<Redis.Redis>(DI.redisForTimelines, { useValue: g.redisForTimelines });
	c.register<Redis.Redis>(DI.redisForReactions, { useValue: g.redisForReactions });
	c.register<Meilisearch | null>(DI.meilisearch, { useValue: g.meilisearch });
	c.register<MiMeta>(DI.meta, { useValue: g.meta });

	// DisposableRegistry は test の `app.resolve(DisposableRegistry).disposeAll()` で
	// per-test の cleanup に使う。グローバル resource (DB/Redis) はここで dispose しない
	// (process 終了時に `disposeGlobalResources()` を別途呼ぶ)。
	c.registerSingleton(DisposableRegistry);
}

// SIGTERM/SIGINT などで process が終了する時に、グローバル resource を解放する。
// `boot/common.ts` のシグナルハンドラから呼ばれる。test では呼ばない。
export async function disposeGlobalResources(): Promise<void> {
	if (cached === null) return;
	const { db, redis, redisForPub, redisForSub, redisForTimelines, redisForReactions } = cached;
	cached = null;
	await allSettled();
	await Promise.all([
		db.destroy(),
		redis.disconnect(),
		redisForPub.disconnect(),
		redisForSub.disconnect(),
		redisForTimelines.disconnect(),
		redisForReactions.disconnect(),
	]);
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
