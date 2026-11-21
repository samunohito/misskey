/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { Result } from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';

declare module 'ioredis' {
	interface RedisCommander<Context> {
		/**
		 * list を maxlen まで末尾から捨てる (1 回に捨てるのは popCap 件まで)。
		 * recordWm が 1 なら、捨てた ID の最大値で水位を引き上げる。戻り値は捨てた件数。
		 */
		fanoutTrim(listKey: string, wmKey: string, maxlen: number, popCap: number, recordWm: 0 | 1): Result<number, Context>;
		/** 水位を id まで引き上げる (既存の水位より大きいときだけ)。戻り値は更新したら 1 */
		fanoutRaiseWm(wmKey: string, id: string): Result<number, Context>;
	}
}

export type FanoutTimelineName = (
	// home timeline
	| `homeTimeline:${string}`
	| `homeTimelineWithFiles:${string}` // only notes with files are included
	// local timeline
	| `localTimeline` // replies are not included
	| `localTimelineWithFiles` // only non-reply notes with files are included
	| `localTimelineWithReplies` // only replies are included
	| `localTimelineWithReplyTo:${string}` // Only replies to specific local user are included. Parameter is reply user id.

	// antenna
	| `antennaTimeline:${string}`

	// user timeline
	| `userTimeline:${string}` // replies are not included
	| `userTimelineWithFiles:${string}` // only non-reply notes with files are included
	| `userTimelineWithReplies:${string}` // only replies are included
	| `userTimelineWithChannel:${string}` // only channel notes are included, replies are included

	// user list timelines
	| `userListTimeline:${string}`
	| `userListTimelineWithFiles:${string}` // only notes with files are included

	// channel timelines
	| `channelTimeline:${string}` // replies are included

	// role timelines
	| `roleTimeline:${string}` // any notes are included
);

/** 1 回の trim で捨てる件数の上限。maxlen を大きく下げた直後に Redis を長く塞がないようにする */
export const FANOUT_TRIM_POP_CAP = 256;

/**
 * 水位 (`listwm:{name}`) を記録するキーかどうか。
 * 合成 TL の境界に使わないキーには記録しない (キー数とメモリの節約)。
 */
export function fanoutTimelineRecordsWatermark(name: FanoutTimelineName): boolean {
	return !(
		name.startsWith('antennaTimeline:') ||
		name.startsWith('roleTimeline:') ||
		name.startsWith('localTimelineWithReplyTo:')
	);
}

export type FanoutTimelineSnapshot = {
	name: FanoutTimelineName;
	/** LIST の中身そのまま (絞り込み・ソートはしない) */
	ids: string[];
	/** 水位。キーが無ければ null (= 境界なし) */
	watermark: string | null;
};

// KEYS: list, wm / ARGV: maxlen, popCap, recordWm
// LTRIM 0 maxlen-1 と同じ側 (末尾 = 古い側) から捨てる
const FANOUT_TRIM_LUA = `
local n = math.min(redis.call('LLEN', KEYS[1]) - tonumber(ARGV[1]), tonumber(ARGV[2]))
if n <= 0 then return 0 end
local popped = redis.call('RPOP', KEYS[1], n)
if ARGV[3] == '1' then
  local m = popped[1]
  for i = 2, #popped do if popped[i] > m then m = popped[i] end end
  local cur = redis.call('GET', KEYS[2])
  if (not cur) or m > cur then redis.call('SET', KEYS[2], m) end
end
return n
`;

// KEYS: wm / ARGV: id
const FANOUT_RAISE_WM_LUA = `
local cur = redis.call('GET', KEYS[1])
if (not cur) or ARGV[1] > cur then
  redis.call('SET', KEYS[1], ARGV[1])
  return 1
end
return 0
`;

@Injectable()
export class FanoutTimelineService {
	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		private idService: IdService,
	) {
		// KEYS で渡すので ioredis の keyPrefix が効く
		this.redisForTimelines.defineCommand('fanoutTrim', { numberOfKeys: 2, lua: FANOUT_TRIM_LUA });
		this.redisForTimelines.defineCommand('fanoutRaiseWm', { numberOfKeys: 1, lua: FANOUT_RAISE_WM_LUA });
	}

	@bindThis
	public push(tl: FanoutTimelineName, id: string, maxlen: number, pipeline: Redis.ChainableCommander) {
		// 管理者設定によっては小数になる (例: perUserHomeTimelineCacheMax / 2)
		maxlen = Math.floor(maxlen);
		const listKey = 'list:' + tl;
		const recordsWatermark = fanoutTimelineRecordsWatermark(tl);

		// LPUSH の戻り値が 1 ならキーが今作られた (初めての push か、消えていた)。
		// 作成時点の Redis は、このノートより古い範囲だけでなく「今」までの範囲を把握していない
		// (遅着のノートでキーが作られると、このノートより新しく DB にだけあるノートがありうる)。
		// そのため、水位を max(このノートの ID, 今の ID) まで引き上げる。
		// このノート自体は水位以下になるが、混合区間の Redis 残りとして返るので消えない。
		// 引き上げに失敗しても「水位が無い = 境界なしの緩い扱い」になるだけなので、エラーは握りつぶす。
		const raiseIfCreated = (len: number | null | undefined) => {
			if (len === 1 && recordsWatermark) {
				const now = this.idService.gen();
				this.raiseWatermark(tl, id > now ? id : now).catch(() => {});
			}
		};

		// リモートから遅れて届いた(もしくは後から追加された)投稿日時が古い投稿が追加されるとページネーション時に問題を引き起こすため、
		// 3分以内に投稿されたものでない場合、Redisにある最古のIDより新しい場合のみ追加する
		if (this.idService.parse(id).date.getTime() > Date.now() - 1000 * 60 * 3) {
			pipeline.lpush(listKey, id, (err, len) => {
				if (err == null) raiseIfCreated(len);
			});
			if (Math.random() < 0.1) { // 10%の確率でトリム
				pipeline.fanoutTrim(listKey, 'listwm:' + tl, maxlen, FANOUT_TRIM_POP_CAP, recordsWatermark ? 1 : 0);
			}
		} else {
			// 末尾のIDを取得
			// 呼び出し元は待たないので、Redis のエラーで unhandled rejection にならないよう握りつぶす
			this.redisForTimelines.lindex(listKey, -1).then(lastId => {
				if (lastId == null || (this.idService.parse(id).date.getTime() > this.idService.parse(lastId).date.getTime())) {
					return this.redisForTimelines.lpush(listKey, id).then(raiseIfCreated);
				}
				return undefined;
			}).catch(() => {});
		}
	}

	/**
	 * 水位を id まで引き上げる。既存の水位より大きいときだけ更新する (下げない)。
	 */
	@bindThis
	public async raiseWatermark(tl: FanoutTimelineName, id: string): Promise<void> {
		await this.redisForTimelines.fanoutRaiseWm('listwm:' + tl, id);
	}

	/**
	 * 各キーの LIST と水位を MULTI でまとめて取る (間に trim が入らないスナップショット)。
	 * 結果は入力順。キーが無ければ `ids: []`, `watermark: null`。
	 */
	@bindThis
	public async getSnapshot(names: FanoutTimelineName[]): Promise<FanoutTimelineSnapshot[]> {
		if (names.length === 0) return [];

		const multi = this.redisForTimelines.multi();
		for (const name of names) {
			multi.lrange('list:' + name, 0, -1);
			multi.get('listwm:' + name);
		}
		const res = await multi.exec();
		if (res == null) throw new Error('fanout timeline snapshot transaction was aborted');

		return names.map((name, i) => {
			const [listErr, ids] = res[i * 2];
			const [wmErr, watermark] = res[i * 2 + 1];
			if (listErr) throw listErr;
			if (wmErr) throw wmErr;
			return {
				name,
				ids: ids as string[],
				watermark: watermark as string | null,
			};
		});
	}

	@bindThis
	public get(name: FanoutTimelineName, untilId?: string | null, sinceId?: string | null) {
		if (untilId && sinceId) {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1));
		} else if (untilId) {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1));
		} else if (sinceId) {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1));
		} else {
			return this.redisForTimelines.lrange('list:' + name, 0, -1)
				.then(ids => ids.sort((a, b) => a > b ? -1 : 1));
		}
	}

	@bindThis
	public purge(name: FanoutTimelineName) {
		return this.redisForTimelines.del('list:' + name, 'listwm:' + name);
	}

	@bindThis
	public remove(name: FanoutTimelineName, id: string) {
		return this.redisForTimelines.lrem('list:' + name, 1, id);
	}
}
