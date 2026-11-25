/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	computeBoundary,
	mergeFanoutTimeline,
	type FanoutTimelineMergeEntry,
	type FanoutTimelineMergeParams,
} from '@/core/FanoutTimelineMerger.js';
import type { FanoutTimelineName } from '@/core/FanoutTimelineService.js';

type Item = { id: string; src: 'redis' | 'db' };

/** 辞書順 = 時系列順になる短い ID */
function id(n: number): string {
	return 'n' + String(n).padStart(3, '0');
}

function entry(name: FanoutTimelineName, ids: number[], watermark: number | null = null, boundary = true): FanoutTimelineMergeEntry {
	return { name, ids: ids.map(id), watermark: watermark == null ? null : id(watermark), boundary };
}

function params(p: Partial<FanoutTimelineMergeParams> = {}): FanoutTimelineMergeParams {
	return { untilId: null, sinceId: null, limit: 10, allowPartial: false, useDbFallback: true, ...p };
}

/** makePaginationQuery と同じ並び順で返す DB の代わり */
function fakeDb(dbIds: number[]) {
	const all = dbIds.map(id);
	const calls: [string | null, string | null, number][] = [];
	const dbFallback = async (untilId: string | null, sinceId: string | null, limit: number): Promise<Item[]> => {
		calls.push([untilId, sinceId, limit]);
		const asc = sinceId != null && untilId == null;
		return all
			.filter(x => (untilId == null || x < untilId) && (sinceId == null || x > sinceId))
			.sort((a, b) => (asc ? (a < b ? -1 : 1) : (a > b ? -1 : 1)))
			.slice(0, limit)
			.map(x => ({ id: x, src: 'db' as const }));
	};
	return { dbFallback, calls };
}

/** 拒否集合にある ID を除き、わざと逆順 (任意の順) で返す */
function fakeFetch(reject: number[] = []) {
	const rejected = new Set(reject.map(id));
	const calls: string[][] = [];
	const fetchAndFilter = async (ids: string[]): Promise<Item[]> => {
		calls.push([...ids]);
		return ids.filter(x => !rejected.has(x)).reverse().map(x => ({ id: x, src: 'redis' as const }));
	};
	return { fetchAndFilter, calls };
}

function ids(items: Item[]): string[] {
	return items.map(x => x.id);
}

function isSortedDesc(xs: string[]): boolean {
	return xs.every((x, i) => i === 0 || xs[i - 1] > x);
}

describe('FanoutTimelineMerger', () => {
	test('computeBoundary ignores non-boundary keys and missing watermarks', () => {
		expect(computeBoundary([])).toBeNull();
		expect(computeBoundary([
			entry('localTimeline', [100], 50),
			entry('homeTimeline:a', [90], null),
			entry('localTimelineWithReplyTo:a', [80], 90, false),
		])).toBe(id(50));
		expect(computeBoundary([
			entry('localTimeline', [100], 40),
			entry('homeTimeline:a', [90], 60),
		])).toBe(id(60));
		expect(computeBoundary([
			entry('localTimelineWithReplyTo:a', [80], 90, false),
			entry('homeTimeline:a', [90], null),
		])).toBeNull();
	});

	test('without any watermark it behaves like today', async () => {
		const db = fakeDb([100, 95, 90, 85, 80, 70, 60, 50]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [100, 90, 80]),
			entry('localTimeline', [95, 85]),
		], params(), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(ids(res)).toEqual([100, 95, 90, 85, 80, 70, 60, 50].map(id));
		expect(db.calls).toEqual([[id(80), null, 5]]);
		expect(f.calls).toHaveLength(1);
	});

	test('defect 1: notes older than H come from DB ∪ Redis remainder', async () => {
		// LTL は n070 以下を trim 済み。HTL には水位より古いノートが残っている
		const db = fakeDb([100, 95, 80, 75, 70, 65, 60, 55, 50]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [95, 75, 65, 55]),
			entry('localTimeline', [100, 80], 70),
		], params({ limit: 20 }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		const got = ids(res);
		// 水位より古く DB にだけある LTL のノート
		expect(got).toContain(id(70));
		expect(got).toContain(id(60));
		// 水位より古い HTL のノート
		expect(got).toContain(id(65));
		expect(got).toContain(id(55));
		expect(got).toEqual([100, 95, 80, 75, 70, 65, 60, 55, 50].map(id));
		expect(isSortedDesc(got)).toBe(true);
	});

	test('boundary is exclusive: the note whose id equals H comes from DB', async () => {
		const db = fakeDb([100, 95, 90, 80, 70]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [95, 80]),
			entry('localTimeline', [100, 90], 80),
		], params(), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(ids(res)).toEqual([100, 95, 90, 80, 70].map(id));
		expect(f.calls[0]).not.toContain(id(80));
		expect(res.find(x => x.id === id(80))?.src).toBe('db');
	});

	test('mixed upper bound is the last read id, not H', async () => {
		// d = n070 は H (n050) < d < 最後に読んだ ID (n085) で、DB にだけある
		const db = fakeDb([100, 95, 90, 85, 70, 50, 40]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [95, 85]),
			entry('localTimeline', [100, 90], 50),
		], params(), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(ids(res)).toContain(id(70));
		expect(db.calls[0][0]).toBe(id(85));
		expect(ids(res)).toEqual([100, 95, 90, 85, 70, 50, 40].map(id));
	});

	test('non-boundary key notes older than H survive via the Redis remainder', async () => {
		// 他人への返信は DB からは出てこない
		const db = fakeDb([100, 90, 70]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('localTimeline', [100, 90], 80),
			entry('localTimelineWithReplyTo:a', [95, 60], null, false),
		], params(), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(ids(res)).toEqual([100, 95, 90, 70, 60].map(id));
		expect(res.find(x => x.id === id(60))?.src).toBe('redis');
	});

	test('untilId at or below H goes straight to the mixed range', async () => {
		// n072 は Redis にだけある
		const db = fakeDb([100, 95, 90, 80, 75, 70, 65, 60, 45]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [95, 75, 72, 65, 45]),
			entry('localTimeline', [100, 90], 80),
		], params({ untilId: id(78), limit: 3 }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(db.calls).toEqual([[id(78), null, 3]]);
		// Redis 区間は空なので、R (D の最古 n065 と untilId の間で D に無いもの) の分だけ
		expect(f.calls).toEqual([[id(72)]]);
		expect(ids(res)).toEqual([75, 72, 70].map(id));
	});

	test('ascending reads new notes from DB when Redis has candidates newer than sinceId', async () => {
		// n088 は DB にだけある (ファンアウト中で、まだ Redis に載っていない)
		const db = fakeDb([100, 95, 90, 88, 85, 80, 70]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [95, 85, 75]),
			entry('localTimeline', [100, 90, 80], 70),
		], params({ sinceId: id(80) }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(ids(res)).toEqual([85, 88, 90, 95, 100].map(id));
		expect(db.calls).toEqual([[null, id(80), 10]]);
		expect(f.calls).toEqual([]);
	});

	test('ascending returns [] without DB when Redis has nothing newer than sinceId', async () => {
		// n105 はファンアウト中。Redis に載ってから次のポーリングで DB 経由で返る
		const db = fakeDb([105, 100, 95, 90, 85, 80, 70]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [95, 85, 75]),
			entry('localTimeline', [100, 90, 80], 70),
		], params({ sinceId: id(100) }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(res).toEqual([]);
		expect(db.calls).toEqual([]);
		expect(f.calls).toEqual([]);
	});

	test('ascending with sinceId exactly equal to H trusts Redis', async () => {
		// n075 は DB にだけあるが、sinceId (= H) より新しい範囲に Redis の候補が無いので DB には行かない
		const db = fakeDb([75, 65, 60]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [65, 60]),
			entry('localTimeline', [], 70),
		], params({ sinceId: id(70) }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(res).toEqual([]);
		expect(db.calls).toEqual([]);
	});

	test('ascending falls back to DB when a boundary key without watermark does not reach sinceId', async () => {
		// どちらも水位が無い。k0 は黙って trim されていて (n018 を捨てた)、sinceId まで遡れていない
		const db = fakeDb([30, 29, 28, 23, 20, 18, 17]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('localTimeline', [29, 28, 23, 20]),
			entry('localTimelineWithReplies', [30, 17]),
		], params({ sinceId: id(17) }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(db.calls).toEqual([[null, id(17), 10]]);
		expect(ids(res)).toContain(id(18));
		expect(ids(res)).toEqual([18, 20, 23, 28, 29, 30].map(id));
	});

	test('ascending falls back to DB when sinceId < H', async () => {
		const db = fakeDb([100, 95, 90, 80, 75, 70, 65]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [95, 75, 65]),
			entry('localTimeline', [100, 90], 80),
		], params({ sinceId: id(70), limit: 3 }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(db.calls).toEqual([[null, id(70), 3]]);
		expect(ids(res)).toEqual([75, 80, 90].map(id));
		expect(f.calls).toEqual([]);
	});

	test('ascending falls back to DB when only a non-boundary key reaches sinceId', async () => {
		// Redis には sinceId より新しい候補が無いが、境界に含めるキーは sinceId まで遡れていないので DB に行く
		const db = fakeDb([70, 50]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('localTimeline', []),
			entry('localTimelineWithReplyTo:a', [50], null, false),
		], params({ sinceId: id(60) }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(db.calls).toEqual([[null, id(60), 10]]);
		expect(ids(res)).toEqual([70].map(id));
	});

	test('useDbFallback=false ignores H and never calls dbFallback', async () => {
		const db = fakeDb([100, 95, 90, 80, 75, 70, 65]);
		const f = fakeFetch();
		const entries = [
			entry('homeTimeline:a', [95, 75, 65]),
			entry('localTimeline', [100, 90], 80),
		];

		const desc = await mergeFanoutTimeline(entries, params({ useDbFallback: false }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });
		expect(ids(desc)).toEqual([100, 95, 90, 75, 65].map(id));

		// sinceId < H でも Redis の候補だけを返す
		const asc = await mergeFanoutTimeline(entries, params({ useDbFallback: false, sinceId: id(70) }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });
		expect(ids(asc)).toEqual([75, 90, 95, 100].map(id));

		expect(db.calls).toEqual([]);
	});

	test('returns a note present in multiple keys once', async () => {
		const db = fakeDb([]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [100, 90]),
			entry('localTimeline', [100, 95, 90]),
		], params(), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(ids(res)).toEqual([100, 95, 90].map(id));
		expect(f.calls.flat()).toEqual([100, 95, 90].map(id));
	});

	test('untilId and sinceId: mixed range respects sinceId as the lower cutoff', async () => {
		// n062 は Redis にだけある。n055 / n045 は sinceId 以下なので出てはいけない
		const db = fakeDb([100, 95, 90, 80, 75, 70, 65, 55, 45]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [95, 75, 65, 62, 55, 45]),
			entry('localTimeline', [100, 90], 80),
		], params({ untilId: id(98), sinceId: id(60) }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(db.calls).toEqual([[id(90), id(60), 8]]);
		expect(ids(res)).toEqual([95, 90, 80, 75, 70, 65, 62].map(id));
		expect(ids(res).every(x => x > id(60))).toBe(true);
	});

	test('untilId and sinceId: Redis range never returns notes at or below sinceId', async () => {
		// H (n050) < sinceId なので、Redis 区間の下端は sinceId で決まる
		const db = fakeDb([100, 95, 90, 75, 65, 62, 55, 45]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', [95, 75, 65, 62, 55, 45]),
			entry('localTimeline', [100, 90], 50),
		], params({ untilId: id(98), sinceId: id(60) }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(ids(res)).toEqual([95, 90, 75, 65, 62].map(id));
		expect(ids(res).every(x => x > id(60))).toBe(true);
		expect(f.calls.flat().every(x => x > id(60))).toBe(true);
		expect(db.calls).toEqual([[id(62), id(60), 5]]);
	});

	test('untilId and sinceId: falls back to DB when a boundary key without watermark does not reach sinceId', async () => {
		// k0 は水位が無いまま黙って trim されていて、n025 は DB にだけある
		const db = fakeDb([30, 29, 28, 25, 23, 20, 17]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('localTimeline', [29, 28, 23, 20]),
			entry('localTimelineWithReplies', [30, 17, 15]),
		], params({ untilId: id(31), sinceId: id(17), limit: 5 }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(db.calls).toEqual([[id(31), id(17), 5]]);
		expect(f.calls).toEqual([]);
		expect(ids(res)).toEqual([30, 29, 28, 25, 23].map(id));
	});

	test('untilId and sinceId: falls back to DB like today when no key is a boundary key', async () => {
		// users/notes (withReplies: false) のように境界キーが 1 本も無いと、Redis 区間の完全性を何も保証できない。
		// 今と同じく全部 DB から返す (n030 は DB にだけある)
		const db = fakeDb([30, 20]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('userTimeline:a', [20], null, false),
		], params({ untilId: id(40), sinceId: id(10), limit: 1 }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(db.calls).toEqual([[id(40), id(10), 1]]);
		expect(f.calls).toEqual([]);
		expect(ids(res)).toEqual([id(30)]);
	});

	test('untilId and sinceId: a boundary key alongside non-boundary keys keeps the Redis range', async () => {
		const db = fakeDb([30, 20]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('localTimeline', [20, 5], 15),
			entry('localTimelineWithReplyTo:a', [25], null, false),
		], params({ untilId: id(40), sinceId: id(10), limit: 1 }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(db.calls).toEqual([]);
		expect(ids(res)).toEqual([id(25)]);
	});

	test('empty snapshot falls back exactly like today', async () => {
		const db = fakeDb([100, 95, 90, 85, 80, 75, 70]);
		const f = fakeFetch();
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', []),
			entry('localTimeline', []),
		], params({ untilId: id(98), limit: 5 }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });

		expect(db.calls).toEqual([[id(98), null, 5]]);
		expect(f.calls).toEqual([]);
		expect(ids(res)).toEqual([95, 90, 85, 80, 75].map(id));
	});

	test('allowPartial returns after the first non-empty Redis batch', async () => {
		// n130..n101 の 30 件。最初のバッチ (11 件: n130..n120) では n125 と n122 だけが通る
		const all = Array.from({ length: 30 }, (_, k) => 130 - k);
		const reject = all.filter(n => n !== 125 && n !== 122);
		const db = fakeDb(all);

		const f = fakeFetch(reject);
		const res = await mergeFanoutTimeline([
			entry('homeTimeline:a', all),
		], params({ allowPartial: true }), { fetchAndFilter: f.fetchAndFilter, dbFallback: db.dbFallback });
		expect(ids(res)).toEqual([125, 122].map(id));
		expect(f.calls).toHaveLength(1);
		expect(db.calls).toEqual([]);

		// allowPartial でなければ、続けて読む
		const f2 = fakeFetch(reject);
		await mergeFanoutTimeline([
			entry('homeTimeline:a', all),
		], params({ allowPartial: false }), { fetchAndFilter: f2.fetchAndFilter, dbFallback: db.dbFallback });
		expect(f2.calls.length).toBeGreaterThan(1);
	});
});
