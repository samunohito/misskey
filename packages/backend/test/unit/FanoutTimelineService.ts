/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import * as Redis from 'ioredis';
import { loadConfig, type Config } from '@/config.js';
import { IdService } from '@/core/IdService.js';
import { FanoutTimelineService, type FanoutTimelineName } from '@/core/FanoutTimelineService.js';

describe('FanoutTimelineService', () => {
	let config: Config;
	let redis: Redis.Redis;
	let idService: IdService;
	let service: FanoutTimelineService;
	const usedNames: FanoutTimelineName[] = [];

	function uniqueName<T extends FanoutTimelineName>(make: (suffix: string) => T): T {
		const name = make(randomUUID());
		usedNames.push(name);
		return name;
	}

	/** 新しい順に count 件の ID を作る (すべて 3 分以内の ID) */
	function genIdsDesc(count: number, offsetMs = 1000): string[] {
		const now = Date.now();
		return Array.from({ length: count }, (_, k) => idService.gen(now - offsetMs - k));
	}

	function maxOf(ids: string[]): string {
		return ids.reduce((a, b) => (a > b ? a : b));
	}

	beforeAll(() => {
		config = loadConfig();
		redis = new Redis.Redis(config.redisForTimelines);
		idService = new IdService(config);
		service = new FanoutTimelineService(redis, idService);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		const keys = usedNames.flatMap(name => ['list:' + name, 'listwm:' + name]);
		if (keys.length > 0) await redis.del(...keys);
		redis.disconnect();
	});

	test('trims to floor(maxlen) and records the max dropped id as watermark', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);
		const existing = genIdsDesc(10);
		await redis.rpush('list:' + tl, ...existing);

		vi.spyOn(Math, 'random').mockReturnValue(0);
		const newId = idService.gen();
		const p = redis.pipeline();
		service.push(tl, newId, 5.9, p);
		await p.exec();

		expect(await redis.llen('list:' + tl)).toBe(5);
		// [newId, existing[0..3]] が残り、existing[4..9] の 6 件が捨てられる
		expect(await redis.lrange('list:' + tl, 0, -1)).toEqual([newId, ...existing.slice(0, 4)]);
		expect(await redis.get('listwm:' + tl)).toBe(maxOf(existing.slice(4)));
	});

	test('popCap limits a single trim', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);
		const existing = genIdsDesc(600);
		await redis.rpush('list:' + tl, ...existing);

		vi.spyOn(Math, 'random').mockReturnValue(0);
		const p = redis.pipeline();
		service.push(tl, idService.gen(), 10, p);
		await p.exec();

		expect(await redis.llen('list:' + tl)).toBe(601 - 256);
		expect(await redis.get('listwm:' + tl)).toBe(maxOf(existing.slice(600 - 256)));
	});

	test('watermark never decreases on trim', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);
		await redis.rpush('list:' + tl, ...genIdsDesc(10));
		await redis.set('listwm:' + tl, 'zzzz');

		vi.spyOn(Math, 'random').mockReturnValue(0);
		const p = redis.pipeline();
		service.push(tl, idService.gen(), 5, p);
		await p.exec();

		expect(await redis.llen('list:' + tl)).toBe(5);
		expect(await redis.get('listwm:' + tl)).toBe('zzzz');
	});

	test('does not record watermark for localTimelineWithReplyTo / antennaTimeline / roleTimeline', async () => {
		const names = [
			uniqueName(s => `localTimelineWithReplyTo:${s}` as const),
			uniqueName(s => `antennaTimeline:${s}` as const),
			uniqueName(s => `roleTimeline:${s}` as const),
		];

		vi.spyOn(Math, 'random').mockReturnValue(0);
		for (const tl of names) {
			// キー作成 (LPUSH の戻り値 1) の経路も通す
			const p1 = redis.pipeline();
			service.push(tl, idService.gen(Date.now() - 2000), 5, p1);
			await p1.exec();

			await redis.rpush('list:' + tl, ...genIdsDesc(10, 3000));

			const p2 = redis.pipeline();
			service.push(tl, idService.gen(), 5, p2);
			await p2.exec();

			expect(await redis.llen('list:' + tl)).toBe(5);
			expect(await redis.exists('listwm:' + tl)).toBe(0);
		}
	});

	test('raises watermark to the id when the list is created (normal path)', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);

		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const id = idService.gen();
		const p = redis.pipeline();
		service.push(tl, id, 10, p);
		await p.exec();

		await vi.waitFor(async () => {
			expect(await redis.get('listwm:' + tl)).toBe(id);
		});
		expect(await redis.lrange('list:' + tl, 0, -1)).toEqual([id]);
	});

	test('raises watermark when the list is created via the late path', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);

		const id = idService.gen(Date.now() - 1000 * 60 * 4);
		const p = redis.pipeline();
		service.push(tl, id, 10, p);
		await p.exec();

		await vi.waitFor(async () => {
			expect(await redis.get('listwm:' + tl)).toBe(id);
		});
		expect(await redis.lrange('list:' + tl, 0, -1)).toEqual([id]);
	});

	test('raiseWatermark does not lower an existing watermark', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);
		const high = idService.gen();
		const low = idService.gen(Date.now() - 60 * 1000);

		await service.raiseWatermark(tl, high);
		await service.raiseWatermark(tl, low);
		expect(await redis.get('listwm:' + tl)).toBe(high);
	});

	test('getSnapshot returns ids and watermark per key in input order', async () => {
		const a = uniqueName(s => `homeTimeline:${s}` as const);
		const b = uniqueName(s => `userTimeline:${s}` as const);
		const missing = uniqueName(s => `userListTimeline:${s}` as const);

		const aIds = genIdsDesc(3);
		const bIds = genIdsDesc(2, 5000);
		await redis.rpush('list:' + a, ...aIds);
		await redis.set('listwm:' + a, aIds[2]);
		await redis.rpush('list:' + b, ...bIds);

		const snapshot = await service.getSnapshot([b, missing, a]);
		expect(snapshot).toEqual([
			{ name: b, ids: bIds, watermark: null },
			{ name: missing, ids: [], watermark: null },
			{ name: a, ids: aIds, watermark: aIds[2] },
		]);
	});

	test('purge deletes both list and watermark', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);
		await redis.rpush('list:' + tl, ...genIdsDesc(3));
		await redis.set('listwm:' + tl, idService.gen());

		await service.purge(tl);

		expect(await redis.exists('list:' + tl)).toBe(0);
		expect(await redis.exists('listwm:' + tl)).toBe(0);
	});

	test('lua commands honor keyPrefix', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);
		const raw = new Redis.Redis({ ...config.redisForTimelines, keyPrefix: undefined });
		try {
			await redis.rpush('list:' + tl, ...genIdsDesc(10));

			vi.spyOn(Math, 'random').mockReturnValue(0);
			const p = redis.pipeline();
			service.push(tl, idService.gen(), 5, p);
			await p.exec();

			const prefix = config.redisForTimelines.keyPrefix;
			expect(prefix).toBeTruthy();
			expect(await raw.exists(prefix + 'listwm:' + tl)).toBe(1);
			expect(await raw.llen(prefix + 'list:' + tl)).toBe(5);
			expect(await raw.exists('listwm:' + tl)).toBe(0);
		} finally {
			raw.disconnect();
		}
	});
});
