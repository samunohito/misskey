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

	// 今は maxlen 0 が LTRIM 0 -1 (全件保持)、小数は LTRIM がエラーで trim されない。どちらもノートを捨てない側に揃える
	test.each([0, 0.5, -3])('does not trim when floor(maxlen) <= 0 (maxlen = %s)', async (maxlen) => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);
		await redis.rpush('list:' + tl, ...genIdsDesc(10));

		vi.spyOn(Math, 'random').mockReturnValue(0);
		const p = redis.pipeline();
		service.push(tl, idService.gen(), maxlen, p);
		await p.exec();

		expect(await redis.llen('list:' + tl)).toBe(11);
		expect(await redis.exists('listwm:' + tl)).toBe(0);
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
		const raiseSpy = vi.spyOn(service, 'raiseWatermark');
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
		expect(raiseSpy).not.toHaveBeenCalled();
	});

	test('raises watermark to now when the list is created (normal path)', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);

		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const id = idService.gen(Date.now() - 2000);
		const before = Date.now();
		const p = redis.pipeline();
		service.push(tl, id, 10, p);
		await p.exec();

		let wm: string | null = null;
		await vi.waitFor(async () => {
			wm = await redis.get('listwm:' + tl);
			expect(wm).not.toBeNull();
		});
		expect(wm! > id).toBe(true);
		expect(idService.parse(wm!).date.getTime()).toBeGreaterThanOrEqual(before);
		expect(await redis.lrange('list:' + tl, 0, -1)).toEqual([id]);
	});

	test('raises watermark to now when the list is created via the late path with an old id', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);

		const id = idService.gen(Date.now() - 1000 * 60 * 60);
		const before = Date.now();
		const p = redis.pipeline();
		service.push(tl, id, 10, p);
		await p.exec();

		let wm: string | null = null;
		await vi.waitFor(async () => {
			wm = await redis.get('listwm:' + tl);
			expect(wm).not.toBeNull();
		});
		expect(wm! > id).toBe(true);
		expect(idService.parse(wm!).date.getTime()).toBeGreaterThanOrEqual(before);
		expect(await redis.lrange('list:' + tl, 0, -1)).toEqual([id]);
	});

	test.each([
		['normal path', 2000],
		['late path', 1000 * 60 * 60],
	])('raise on list creation does not lower an existing watermark (%s)', async (_, ageMs) => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);
		await redis.set('listwm:' + tl, 'zzzz');

		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const raiseSpy = vi.spyOn(service, 'raiseWatermark');
		const id = idService.gen(Date.now() - ageMs);
		const p = redis.pipeline();
		service.push(tl, id, 10, p);
		await p.exec();

		// 引き上げが実際に送られ、完了したことを確かめてから水位を見る
		await vi.waitFor(() => {
			expect(raiseSpy).toHaveBeenCalledTimes(1);
		});
		await raiseSpy.mock.results[0].value;
		expect(await redis.get('listwm:' + tl)).toBe('zzzz');
		expect(await redis.lrange('list:' + tl, 0, -1)).toEqual([id]);
	});

	describe('late path rejects a push', () => {
		/** 末尾 tail のキーに、遅着の id を push する (拒否される前提)。引き上げの完了まで待つ */
		async function pushRejected(tl: FanoutTimelineName, id: string) {
			const raiseSpy = vi.spyOn(service, 'raiseWatermark');
			const p = redis.pipeline();
			service.push(tl, id, 10, p);
			await p.exec();
			await vi.waitFor(() => {
				expect(raiseSpy).toHaveBeenCalledTimes(1);
			});
			await raiseSpy.mock.results[0].value;
		}

		test('raises watermark to the tail id when the rejected id is older than the tail', async () => {
			const tl = uniqueName(s => `homeTimeline:${s}` as const);
			const base = Date.now() - 1000 * 60 * 60;
			const tail = idService.gen(base);
			const head = idService.gen(base + 1000);
			await redis.rpush('list:' + tl, head, tail);
			await redis.set('listwm:' + tl, idService.gen(base - 1000 * 60));

			const rejected = idService.gen(base - 1000);
			await pushRejected(tl, rejected);

			expect(await redis.get('listwm:' + tl)).toBe(tail);
			expect(await redis.lrange('list:' + tl, 0, -1)).toEqual([head, tail]);
		});

		test('raises watermark to the rejected id when it is newer than the tail in the same ms', async () => {
			const tl = uniqueName(s => `homeTimeline:${s}` as const);
			const t = Date.now() - 1000 * 60 * 60;
			// 同じ時刻の ID を 2 つ作り、小さい方を末尾にする (時刻が同じなので大きい方も拒否される)
			let a = idService.gen(t);
			let b = idService.gen(t);
			while (a === b) b = idService.gen(t);
			if (a > b) [a, b] = [b, a];
			await redis.rpush('list:' + tl, a);

			await pushRejected(tl, b);

			expect(await redis.get('listwm:' + tl)).toBe(b);
			expect(await redis.lrange('list:' + tl, 0, -1)).toEqual([a]);
		});

		test('does not lower an existing watermark', async () => {
			const tl = uniqueName(s => `homeTimeline:${s}` as const);
			const base = Date.now() - 1000 * 60 * 60;
			await redis.rpush('list:' + tl, idService.gen(base));
			await redis.set('listwm:' + tl, 'zzzz');

			await pushRejected(tl, idService.gen(base - 1000));

			expect(await redis.get('listwm:' + tl)).toBe('zzzz');
		});

		test('does not record watermark for keys without watermark', async () => {
			const tl = uniqueName(s => `localTimelineWithReplyTo:${s}` as const);
			const base = Date.now() - 1000 * 60 * 60;
			const tail = idService.gen(base);
			await redis.rpush('list:' + tl, tail);

			const lindexSpy = vi.spyOn(redis, 'lindex');
			const raiseSpy = vi.spyOn(service, 'raiseWatermark');
			const p = redis.pipeline();
			service.push(tl, idService.gen(base - 1000), 10, p);
			await p.exec();
			await vi.waitFor(() => {
				expect(lindexSpy).toHaveBeenCalledTimes(1);
			});
			await lindexSpy.mock.results[0].value;
			await new Promise(r => setTimeout(r, 50));

			expect(raiseSpy).not.toHaveBeenCalled();
			expect(await redis.exists('listwm:' + tl)).toBe(0);
			expect(await redis.lrange('list:' + tl, 0, -1)).toEqual([tail]);
		});
	});

	test('every pushed id above the watermark stays in the list (random pushes with late ids)', async () => {
		const tl = uniqueName(s => `homeTimeline:${s}` as const);

		// 再現性のための簡単な PRNG (mulberry32)
		let seed = 0x5eed;
		const rand = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = seed;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		vi.spyOn(Math, 'random').mockImplementation(rand);

		// 時間の経過を模擬する。通常のノートは 60 秒に 1 件、その時点で 3 分以内の ID で push する。
		// LIST は maxlen 20 で 20 分ほどにまたがるので、遅れ幅がそれより小さい遅着ノートは、
		// LIST に入るか、末尾より古くて拒否される。拒否されたものは、水位を引き上げないと穴になりうる
		let clock = Date.now() - 1000 * 60 * 60 * 10;
		vi.spyOn(Date, 'now').mockImplementation(() => clock);

		// 作成時の引き上げで水位が「今」まで上がると検査が素通りになるので、キーは先に作っておく
		const initial = Array.from({ length: 5 }, (_, k) => idService.gen(clock - 1000 * 60 * 60 - k));
		await redis.rpush('list:' + tl, ...initial);

		// 遅着の経路は push の呼び出し元を待たずに LINDEX → LPUSH (拒否なら水位の引き上げ) をするので、
		// spy でその完了を待つ。拒否したものも push したものとして数える
		const lpushSpy = vi.spyOn(redis, 'lpush');
		const raiseSpy = vi.spyOn(service, 'raiseWatermark');
		const pushed = new Set<string>(initial);
		let lateCount = 0;
		// 拒否した時点で水位より新しかった遅着の数 (水位を引き上げないと穴になるもの)
		let rejectedAboveWatermark = 0;
		let checkedWithWatermark = 0;

		for (let i = 0; i < 400; i++) {
			const late = rand() < 0.3;
			if (!late) clock += 1000 * 60;
			const id = late
				? idService.gen(clock - 1000 * 60 * 3 - Math.floor(rand() * 1000 * 60 * 27))
				: idService.gen(clock - Math.floor(rand() * 1000));
			pushed.add(id);

			const wmBefore = await redis.get('listwm:' + tl);
			const raiseCallsBefore = raiseSpy.mock.calls.length;
			const p = redis.pipeline();
			service.push(tl, id, 20, p);
			await p.exec();
			if (late) {
				lateCount++;
				await vi.waitFor(() => {
					expect(lpushSpy.mock.calls.length + raiseSpy.mock.calls.length).toBe(lateCount);
				});
				await Promise.all(lpushSpy.mock.results.map(r => r.value));
				await Promise.all(raiseSpy.mock.results.map(r => r.value));
				if (raiseSpy.mock.calls.length > raiseCallsBefore && wmBefore != null && id > wmBefore) {
					rejectedAboveWatermark++;
				}
			}

			// push のたびに「水位より新しい ID で push したものは LIST にある」を確かめる
			const [snapshot] = await service.getSnapshot([tl]);
			if (snapshot.watermark == null) continue;
			checkedWithWatermark++;
			const list = new Set(snapshot.ids);
			const missing = [...pushed].filter(x => x > snapshot.watermark! && !list.has(x));
			expect(missing).toEqual([]);
		}

		expect(lpushSpy).toHaveBeenCalled(); // 遅着のうち、実際に push されたものがある
		expect(rejectedAboveWatermark).toBeGreaterThan(0); // 引き上げが無いと穴になる拒否が起きている (検査が素通りでない)
		expect(checkedWithWatermark).toBeGreaterThan(0);
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
