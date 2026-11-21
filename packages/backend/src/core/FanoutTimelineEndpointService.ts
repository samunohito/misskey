/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import type { MiMeta } from '@/models/Meta.js';
import { Packed } from '@/misc/json-schema.js';
import type { NotesRepository } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { FanoutTimelineName, FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { CacheService } from '@/core/CacheService.js';
import { isReply } from '@/misc/is-reply.js';
import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import { isChannelRelated } from '@/misc/is-channel-related.js';
import { mergeFanoutTimeline } from '@/core/FanoutTimelineMerger.js';
import type { FanoutTimelineMergeEntry } from '@/core/FanoutTimelineMerger.js';

type NoteFilter = (note: MiNote) => boolean;

/**
 * 合成するキーの指定。文字列は境界に含める (`boundary: true`) とみなす。
 * DB フォールバックで内容を再現できないキーは `boundary: false` にする。
 */
export type FanoutTimelineSource = FanoutTimelineName | { name: FanoutTimelineName; boundary: boolean };

type TimelineOptions = {
	untilId: string | null,
	sinceId: string | null,
	limit: number,
	allowPartial: boolean,
	me?: { id: MiUser['id'] } | undefined | null,
	useDbFallback: boolean,
	redisTimelines: FanoutTimelineSource[],
	noteFilter?: NoteFilter,
	alwaysIncludeMyNotes?: boolean;
	ignoreAuthorFromBlock?: boolean;
	ignoreAuthorFromMute?: boolean;
	ignoreAuthorFromInstanceBlock?: boolean;
	ignoreAuthorChannelFromMute?: boolean;
	excludeNoFiles?: boolean;
	excludeReplies?: boolean;
	excludePureRenotes: boolean;
	ignoreAuthorFromUserSuspension?: boolean;
	dbFallback: (untilId: string | null, sinceId: string | null, limit: number) => Promise<MiNote[]>,
};

@Injectable()
export class FanoutTimelineEndpointService {
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.meta)
		private meta: MiMeta,

		private noteEntityService: NoteEntityService,
		private cacheService: CacheService,
		private fanoutTimelineService: FanoutTimelineService,
		private utilityService: UtilityService,
		private channelMutingService: ChannelMutingService,
	) {
	}

	@bindThis
	async timeline(ps: TimelineOptions): Promise<Packed<'Note'>[]> {
		return await this.noteEntityService.packMany(await this.getMiNotes(ps), ps.me);
	}

	@bindThis
	async getMiNotes(ps: TimelineOptions): Promise<MiNote[]> {
		const ascending = ps.sinceId && !ps.untilId;
		const idCompare: (a: string, b: string) => number = ascending ? (a, b) => a < b ? -1 : 1 : (a, b) => a > b ? -1 : 1;

		// 文字列で指定されたキーは境界に含める
		const timelines = ps.redisTimelines.map(tl => typeof tl === 'string' ? { name: tl, boundary: true } : tl);

		const snapshot = await this.fanoutTimelineService.getSnapshot(timelines.map(tl => tl.name));

		// フィルタの組み立てはキャッシュを引くので、Redis の候補を読むときだけ行う (DB だけで返すときは不要)
		let filter: Promise<NoteFilter> | null = null;
		const getFilter = () => filter ??= this.buildFilter(ps);

		const entries: FanoutTimelineMergeEntry[] = snapshot.map((s, i) => ({ ...s, boundary: timelines[i].boundary }));

		return await mergeFanoutTimeline(entries, {
			untilId: ps.untilId,
			sinceId: ps.sinceId,
			limit: ps.limit,
			allowPartial: ps.allowPartial,
			useDbFallback: ps.useDbFallback,
		}, {
			fetchAndFilter: async ids => this.getAndFilterFromDb(ids, await getFilter(), idCompare),
			dbFallback: ps.useDbFallback ? ps.dbFallback : () => Promise.resolve([]),
		});
	}

	private async buildFilter(ps: TimelineOptions): Promise<NoteFilter> {
		let filter = ps.noteFilter ?? (_note => true) as NoteFilter;

		if (ps.alwaysIncludeMyNotes && ps.me) {
			const me = ps.me;
			const parentFilter = filter;
			filter = (note) => note.userId === me.id || parentFilter(note);
		}

		if (ps.excludeNoFiles) {
			const parentFilter = filter;
			filter = (note) => note.fileIds.length !== 0 && parentFilter(note);
		}

		if (ps.excludeReplies) {
			const parentFilter = filter;
			filter = (note) => !isReply(note, ps.me?.id) && parentFilter(note);
		}

		if (ps.excludePureRenotes) {
			const parentFilter = filter;
			filter = (note) => (!isRenote(note) || isQuote(note)) && parentFilter(note);
		}

		if (ps.me) {
			const me = ps.me;
			const [
				userIdsWhoMeMuting,
				userIdsWhoMeMutingRenotes,
				userIdsWhoBlockingMe,
				userMutedInstances,
				userMutedChannels,
			] = await Promise.all([
				this.cacheService.userMutingsCache.fetch(ps.me.id),
				this.cacheService.renoteMutingsCache.fetch(ps.me.id),
				this.cacheService.userBlockedCache.fetch(ps.me.id),
				this.cacheService.userProfileCache.fetch(me.id).then(p => new Set(p.mutedInstances)),
				this.channelMutingService.mutingChannelsCache.fetch(me.id),
			]);

			const parentFilter = filter;
			filter = (note) => {
				if (isUserRelated(note, userIdsWhoBlockingMe, ps.ignoreAuthorFromBlock)) return false;
				if (isUserRelated(note, userIdsWhoMeMuting, ps.ignoreAuthorFromMute)) return false;
				if (isUserRelated(note.renote, userIdsWhoBlockingMe, ps.ignoreAuthorFromBlock)) return false;
				if (isUserRelated(note.renote, userIdsWhoMeMuting, ps.ignoreAuthorFromMute)) return false;
				if (!ps.ignoreAuthorFromMute && isRenote(note) && !isQuote(note) && userIdsWhoMeMutingRenotes.has(note.userId)) return false;
				if (isInstanceMuted(note, userMutedInstances)) return false;
				if (isChannelRelated(note, userMutedChannels, ps.ignoreAuthorChannelFromMute)) return false;

				return parentFilter(note);
			};
		}

		{
			const parentFilter = filter;
			filter = (note) => {
				if (!ps.ignoreAuthorFromInstanceBlock) {
					if (this.utilityService.isBlockedHost(this.meta.blockedHosts, note.userHost)) return false;
				}
				if (note.userId !== note.renoteUserId && this.utilityService.isBlockedHost(this.meta.blockedHosts, note.renoteUserHost)) return false;
				if (note.userId !== note.replyUserId && this.utilityService.isBlockedHost(this.meta.blockedHosts, note.replyUserHost)) return false;

				return parentFilter(note);
			};
		}

		if (ps.me == null && this.meta.ugcVisibilityForVisitor !== 'all') {
			const parentFilter = filter;
			filter = (note) => {
				if (this.meta.ugcVisibilityForVisitor === 'none') return false;
				if (this.meta.ugcVisibilityForVisitor === 'local' && note.userHost != null) return false;

				return parentFilter(note);
			};
		}

		{
			const parentFilter = filter;
			filter = (note) => {
				if (!ps.ignoreAuthorFromUserSuspension) {
					if (note.user!.isSuspended) return false;
				}
				if (note.userId !== note.renoteUserId && note.renote?.user?.isSuspended) return false;
				if (note.userId !== note.replyUserId && note.reply?.user?.isSuspended) return false;

				return parentFilter(note);
			};
		}

		return filter;
	}

	private async getAndFilterFromDb(noteIds: string[], noteFilter: NoteFilter, idCompare: (a: string, b: string) => number): Promise<MiNote[]> {
		const query = this.notesRepository.createQueryBuilder('note')
			.where('note.id IN (:...noteIds)', { noteIds: noteIds })
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser')
			.leftJoinAndSelect('note.channel', 'channel');

		const notes = (await query.getMany()).filter(noteFilter);

		notes.sort((a, b) => idCompare(a.id, b.id));

		return notes;
	}
}
