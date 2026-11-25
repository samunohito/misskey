/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { FanoutTimelineSnapshot } from '@/core/FanoutTimelineService.js';

/**
 * 合成 TL を構成するキー 1 本ぶんの入力。
 * boundary: このキーの水位を境界 H に含めるか。DB フォールバックがこのキーの内容を再現できないキー
 * (例: `localTimelineWithReplyTo:*`) は false にする。
 */
export type FanoutTimelineMergeEntry = FanoutTimelineSnapshot & { boundary: boolean };

export type FanoutTimelineMergeParams = {
	untilId: string | null;
	sinceId: string | null;
	limit: number;
	allowPartial: boolean;
	useDbFallback: boolean;
};

export type FanoutTimelineMergeDeps<T extends { id: string }> = {
	/** ID 群を DB から取得し、フィルタを通ったものを任意の順で返す */
	fetchAndFilter: (ids: string[]) => Promise<T[]>;
	/** makePaginationQuery と同じ規則で DB から読む */
	dbFallback: (untilId: string | null, sinceId: string | null, limit: number) => Promise<T[]>;
};

const compareDesc = (a: string, b: string): number => a > b ? -1 : a < b ? 1 : 0;
const compareAsc = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/**
 * 境界 H = 境界に含めるキーの水位の最大値。どれにも水位が無ければ null (= -∞)。
 * H 以下の ID は、どれかのキーで trim 済みの可能性がある (= Redis だけでは完全でない) 範囲。
 */
export function computeBoundary(entries: FanoutTimelineMergeEntry[]): string | null {
	let h: string | null = null;
	for (const e of entries) {
		if (!e.boundary || e.watermark == null) continue;
		if (h == null || e.watermark > h) h = e.watermark;
	}
	return h;
}

/**
 * 水位を持たない境界キーが、すべて sinceId まで遡れているか (空のキーは除く)。
 * 水位の無いキーは、デプロイ前の旧コードの LTRIM や水位キーだけの消失で、黙って trim されている可能性がある。
 * その場合は「id > W_k は LIST に揃っている」が成り立たず、`id > sinceId` の範囲も Redis だけでは完全と言えない。
 * LIST の末尾が sinceId 以前に届いていれば、末尾からの trim は `(sinceId, ∞)` を削っていない。
 */
function unwatermarkedKeysReachSinceId(entries: FanoutTimelineMergeEntry[], sinceId: string): boolean {
	return entries.every(e => !e.boundary || e.watermark != null || e.ids.length === 0 || e.ids.some(x => x <= sinceId));
}

/**
 * 既存の適応ループ。ids を idCompare の順に少しずつ読み、フィルタを通ったものを集める。
 * allowPartial なら 1 件以上集まった時点、そうでなければ limit 件に届いた時点で打ち切る。
 */
async function readAdaptively<T extends { id: string }>(
	ids: string[],
	limit: number,
	allowPartial: boolean,
	idCompare: (a: string, b: string) => number,
	fetchAndFilter: (ids: string[]) => Promise<T[]>,
): Promise<{ items: T[]; lastReadId: string | null; satisfied: boolean }> {
	const items: T[] = [];
	let readCount = 0;
	let lastReadId: string | null = null;
	let lastSuccessfulRate = 1; // rateをキャッシュする？

	while (ids.length - readCount !== 0) {
		const remainingToRead = limit - items.length;

		// DBからの取り直しを減らす初回と同じ割合以上で成功すると仮定するが、クエリの長さを考えて三倍まで
		const countToGet = Math.ceil(remainingToRead * Math.min(1.1 / lastSuccessfulRate, 3));
		const batch = ids.slice(readCount, readCount + countToGet);

		readCount += batch.length;
		lastReadId = batch[batch.length - 1];

		const got = await fetchAndFilter(batch);
		got.sort((a, b) => idCompare(a.id, b.id));
		items.push(...got);
		lastSuccessfulRate = got.length / batch.length;

		if (allowPartial ? items.length !== 0 : items.length >= limit) {
			return { items: items.slice(0, limit), lastReadId, satisfied: true };
		}
	}

	return { items, lastReadId, satisfied: false };
}

/**
 * 複数の FTT キーのスナップショットと DB フォールバックから、合成 TL の 1 ページを作る。
 *
 * - `id > H` (Redis 区間) は Redis の候補だけで完全なので、Redis から返す。
 * - それ以前 (混合区間) は「DB ∪ Redis の残り」から返す。DB だけにあるノート (他のキーで trim 済み) と、
 *   Redis だけにあるノート (DB では再現できないキーの分) の両方を拾う。
 * - 昇順 (sinceId のみ) は、sinceId までが Redis 区間に収まっていれば、Redis を「新着があるか」の判定だけに使う。
 *   新着が無ければ DB に行かずに [] を返し、あれば DB から返す。
 *
 * useDbFallback = false のときは H を無視し、Redis の候補だけを返す (dbFallback は呼ばない)。
 */
export async function mergeFanoutTimeline<T extends { id: string }>(
	entries: FanoutTimelineMergeEntry[],
	params: FanoutTimelineMergeParams,
	deps: FanoutTimelineMergeDeps<T>,
): Promise<T[]> {
	const { untilId, sinceId, limit, allowPartial, useDbFallback } = params;
	const h = useDbFallback ? computeBoundary(entries) : null;

	// 複数のキーにある同じノートは 1 回だけ扱う
	const candidates = Array.from(new Set(entries.flatMap(e => e.ids)));

	if (sinceId != null && untilId == null) {
		// 昇順
		if (!useDbFallback) {
			const ids = candidates.filter(x => x > sinceId).sort(compareAsc);
			const { items } = await readAdaptively(ids, limit, allowPartial, compareAsc, deps.fetchAndFilter);
			return items;
		}

		// 境界に含めないキー (古い ID が残りやすい) だけで「sinceId まで遡れている」と判定してはいけない
		const reachesSinceId = entries.some(e => e.boundary && e.ids.some(x => x <= sinceId));
		if ((h != null && sinceId < h) || !reachesSinceId) {
			return await deps.dbFallback(null, sinceId, limit);
		}

		// sinceId より新しい範囲は Redis だけで把握できているので、新着 0 件なら DB には行かない
		// (水位の無いキーが黙って trim されていても、そのキーが sinceId まで遡れていなければ新着の候補があるので DB に行く)
		if (!candidates.some(x => x > sinceId)) return [];

		// 新着の中身は DB から返す。Redis に載るのはファンアウトの後なので、Redis から返すと、
		// ファンアウト中の古い ID のノートをクライアントの sinceId が追い越して、以後のページングから消える
		return await deps.dbFallback(null, sinceId, limit);
	}

	// 降順
	// sinceId があるのに、水位の無い境界キーが sinceId まで遡れていなければ、Redis 区間の完全性を保証できないので全部 DB にする。
	// 境界キーが 1 本も無い (users/notes の withReplies: false など) ときも完全性を何も保証できないので、今と同じく全部 DB にする
	if (useDbFallback && sinceId != null && (!entries.some(e => e.boundary) || !unwatermarkedKeysReachSinceId(entries, sinceId))) {
		return await deps.dbFallback(untilId, sinceId, limit);
	}

	// Redis 区間: H < id < untilId かつ id > sinceId (境界は排他。id == H は trim 済みなので DB から取る)
	const redisIds = candidates
		.filter(x => (h == null || x > h) && (untilId == null || x < untilId) && (sinceId == null || x > sinceId))
		.sort(compareDesc);
	const redisRange = await readAdaptively(redisIds, limit, allowPartial, compareDesc, deps.fetchAndFilter);
	if (redisRange.satisfied) return redisRange.items;

	// Redis 区間は読み切った (useDbFallback = false なら H を無視しているので候補も読み切っている)
	if (!useDbFallback) return redisRange.items;

	const remaining = limit - redisRange.items.length;
	if (remaining <= 0) return redisRange.items;

	// 混合区間
	// 上端 X は「Redis 区間で最後に読んだ ID」。H を使うと [H, 最後に読んだ位置) の DB にしか無いノートを飛ばす
	const upper = redisRange.lastReadId ?? untilId;
	const fromDb = await deps.dbFallback(upper, sinceId, remaining);

	// D が残り件数ちょうどなら、D の最古より古い分は次のページで扱う
	let cutoff = sinceId;
	if (fromDb.length >= remaining) {
		cutoff = fromDb.reduce((min, n) => n.id < min ? n.id : min, fromDb[0].id);
	}

	// Redis の残り R: cutoff < id < X で D に無いもの (境界に含めないキーの分も含む)
	const fromDbIds = new Set(fromDb.map(n => n.id));
	const remainderIds = candidates
		.filter(x => (cutoff == null || x > cutoff) && (upper == null || x < upper) && !fromDbIds.has(x))
		.sort(compareDesc);
	const { items: fromRedis } = await readAdaptively(remainderIds, remaining, false, compareDesc, deps.fetchAndFilter);

	const merged = [...fromDb, ...fromRedis].sort((a, b) => compareDesc(a.id, b.id)).slice(0, remaining);
	return [...redisRange.items, ...merged];
}
