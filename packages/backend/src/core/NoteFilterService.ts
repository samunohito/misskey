// noinspection RedundantIfStatementJS

import { Injectable } from '@nestjs/common';
import { CacheService } from '@/core/CacheService.js';
import { MiNote } from '@/models/Note.js';
import { Packed } from '@/misc/json-schema.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { MiLocalUser, MiUser } from '@/models/User.js';
import { MiFollowing } from '@/models/Following.js';
import { ChannelFollowingService } from '@/core/ChannelFollowingService.js';
import Connection from '@/server/api/stream/Connection.js';

@Injectable()
export class NoteFilterService {
	constructor(
		private cacheService: CacheService,
		private channelFollowingService: ChannelFollowingService,
	) {
	}

	async filterForRedis(me: MiUser | MiLocalUser | null | undefined, filters: IFilterPresetItem[], notes: MiNote[], options: ITimelineOptions): Promise<MiNote[]> {
		const redisFilter = filters.filter(it => !it.onlyStreaming);
		const filterSource = await this.createFilterSourceByCache(me, redisFilter);

		return notes.filter(note => {
			const params: IFilterParams = {
				me,
				note,
				filterSource,
				options,
			};

			for (const filter of redisFilter) {
				if (!filter.filter.filter(params)) {
					return false;
				}
			}

			return true;
		});
	}

	filterForStreaming<T extends MiNote | Packed<'Note'>>(
		me: MiUser | MiLocalUser | null | undefined,
		connection: Connection,
		filters: IFilterPresetItem[],
		note: T,
		options: ITimelineOptions,
	): boolean {
		const filterSource = this.createFilterSourceByConnection(connection);
		const params: IFilterParams = {
			me,
			note,
			filterSource,
			options,
		};

		for (const filter of filters) {
			if (!filter.filter.filter(params)) {
				return false;
			}
		}

		return true;
	}

	private async createFilterSourceByCache(
		me: MiUser | MiLocalUser | null | undefined,
		filterPresets: IFilterPresetItem[],
	): Promise<IFilterSource> {
		const necessaryCaches = new Set(
			filterPresets.flatMap(it => it.filter.necessaryCaches),
		);

		const [
			userIdsWhoMeMuting,
			userIdsWhoMeMutingRenotes,
			userIdsWhoBlockingMe,
			instancesMuting,
			following,
			followingChannels,
		] = await Promise.all([
			me && necessaryCaches.has('userIdsWhoMeMuting') ? this.cacheService.userMutingsCache.fetch(me.id) : new Set<string>(),
			me && necessaryCaches.has('userIdsWhoMeMutingRenotes') ? this.cacheService.renoteMutingsCache.fetch(me.id) : new Set<string>(),
			me && necessaryCaches.has('userIdsWhoBlockingMe') ? this.cacheService.userBlockedCache.fetch(me.id) : new Set<string>(),
			me && necessaryCaches.has('instancesMuting') ? this.cacheService.userProfileCache.fetch(me.id).then(it => new Set<string>(it.mutedInstances)) : new Set<string>(),
			me && necessaryCaches.has('following') ? this.cacheService.userFollowingsCache.fetch(me.id) : {} as Record<string, Pick<MiFollowing, 'withReplies'> | undefined>,
			me && necessaryCaches.has('followingChannels') ? this.channelFollowingService.userFollowingChannelsCache.fetch(me.id) : new Set<string>(),
		]);

		return {
			userIdsWhoBlockingMe: userIdsWhoBlockingMe,
			userIdsWhoMeMuting: userIdsWhoMeMuting,
			userIdsWhoMeMutingRenotes: userIdsWhoMeMutingRenotes,
			instancesMuting: instancesMuting,
			following: following,
			followingChannels: followingChannels,
		};
	}

	private createFilterSourceByConnection(connection: Connection): IFilterSource {
		return {
			userIdsWhoBlockingMe: connection.userIdsWhoBlockingMe,
			userIdsWhoMeMuting: connection.userIdsWhoMeMuting,
			userIdsWhoMeMutingRenotes: connection.userIdsWhoMeMutingRenotes,
			instancesMuting: new Set(connection.userProfile?.mutedInstances ?? []),
			following: connection.following,
			followingChannels: connection.followingChannels,
		};
	}
}

interface INoteFilter {
	readonly necessaryCaches: (keyof IFilterSource)[]
	filter(params: IFilterParams): boolean
}

class BlockMuteFilter implements INoteFilter {
	readonly necessaryCaches: (keyof IFilterSource)[] = [
		'userIdsWhoBlockingMe',
		'userIdsWhoMeMuting',
		'userIdsWhoMeMutingRenotes',
	];

	filter(params: IFilterParams): boolean {
		const { note, filterSource } = params;

		if (isUserRelated(note, filterSource.userIdsWhoBlockingMe)) {
			// ノートの配信元ユーザが配信先ユーザをブロックしている
			return false;
		}

		if (isUserRelated(note, filterSource.userIdsWhoMeMuting)) {
			// ノートの配信先ユーザが配信元ユーザをミュートしている
			return false;
		}

		if (!isQuote(note) && isUserRelated(note, filterSource.userIdsWhoMeMutingRenotes)) {
			// ノートの配信先ユーザが配信元ユーザによるリノートをミュートしている
			return false;
		}

		return true;
	}
}

class OnlyAttachmentFilesFilter implements INoteFilter {
	readonly necessaryCaches: (keyof IFilterSource)[];

	filter(params: IFilterParams): boolean {
		const { note, options } = params;

		if (options.withFiles) {
			if (note.fileIds == null || note.fileIds.length === 0) {
				// ファイルが添付されていないノートは許可しない
				return false;
			}
		}

		return true;
	}
}

class IncludeRenotesFilter implements INoteFilter {
	readonly necessaryCaches: (keyof IFilterSource)[];

	filter(params: IFilterParams): boolean {
		const { note, options } = params;

		if (!options.withRenotes && !isQuote(note)) {
			// 引用リノートでないものは許可しない
			return false;
		}

		return true;
	}
}

class IncludeRepliesFilter implements INoteFilter {
	readonly necessaryCaches: (keyof IFilterSource)[];

	filter(params: IFilterParams): boolean {
		const { me, note, options } = params;

		if (!options.withReplies) {
			const reply = note.reply;
			if (reply && reply.userId !== note.userId && (!me || reply.userId !== me.id)) {
				// リプライ先が自分の作成したノートではない場合は許可しない
				return false;
			}
		}

		return true;
	}
}

class FollowingChannelNotesFilter implements INoteFilter {
	readonly necessaryCaches: (keyof IFilterSource)[] = ['followingChannels'];

	filter(params: IFilterParams): boolean {
		const { note, filterSource } = params;

		if (!note.channelId) {
			// そもそもチャンネル投稿ではない
			return true;
		}

		if (filterSource.followingChannels.has(note.channelId)) {
			// チャンネル投稿の場合はフィルタしない
			return true;
		}

		return false;
	}
}

class FollowingUserNotesFilter implements INoteFilter {
	readonly necessaryCaches: (keyof IFilterSource)[] = ['following'];

	filter(params: IFilterParams): boolean {
		const { note, me, filterSource } = params;
		const isMe = me?.id === note.userId;

		if (isMe) {
			// 自分自身の場合はフィルタしない
			return true;
		}

		if (Object.hasOwn(filterSource.following, note.userId)) {
			// フォローしている場合はフィルタしない
			return true;
		}

		return false;
	}
}

class VisibilityFollowingUserNotesFilter extends FollowingUserNotesFilter {
	filter(params: IFilterParams): boolean {
		const { note } = params;

		if (note.visibility !== 'followers') {
			// そもそもフォロワー限定投稿ではない
			return true;
		}

		return super.filter(params);
	}
}

class VisibilitySpecifiedNotesFilter implements INoteFilter {
	readonly necessaryCaches: (keyof IFilterSource)[];

	filter(params: IFilterParams): boolean {
		const { note, me } = params;

		if (note.visibility !== 'specified') {
			// そもそもDMではない
			return true;
		}

		const isMe = me?.id === note.userId;
		if (isMe) {
			// 自身のノートの場合はフィルタしない
			return true;
		}

		if (me && note.visibleUserIds && note.visibleUserIds.includes(me.id)) {
			// 返信先一覧に含まれている場合はフィルタしない
			return true;
		}

		return false;
	}
}

class ReplyFollowerScopeFilter implements INoteFilter {
	readonly necessaryCaches: (keyof IFilterSource)[] = ['following'];

	filter(params: IFilterParams): boolean {
		const { me, note, filterSource } = params;
		const reply = note.reply;

		if (!reply) {
			// リプライがない
			return true;
		}

		if (reply.visibility !== 'followers') {
			// そもそもフォロワー限定ではない
			return true;
		}

		if (filterSource.following[note.userId]?.withReplies) {
			// 他人へのリプライを表示する場合
			if (Object.hasOwn(filterSource.following, reply.userId)) {
				// フォロワー一覧に含まれている場合はフィルタしない
				return true;
			}
		} else {
			if (me && note.userId === me.id && reply.userId === me.id && note.userId === reply.userId) {
				// 自分が行ったリプライであればフィルタしない
				return true;
			}
		}

		return false;
	}
}

export interface IFilterPresetItem {
	onlyStreaming: boolean,
	filter: INoteFilter,
}

interface IFilterParams {
	me: MiUser | MiLocalUser | null | undefined;
	note: MiNote | Packed<'Note'>;
	filterSource: IFilterSource;
	options: ITimelineOptions;
}

export interface IFilterSource {
	userIdsWhoBlockingMe: Set<string>,
	userIdsWhoMeMuting: Set<string>,
	userIdsWhoMeMutingRenotes: Set<string>,
	instancesMuting: Set<string>,
	following: Record<string, Pick<MiFollowing, 'withReplies'> | undefined>,
	followingChannels: Set<string>,
}

export interface ITimelineOptions {
	/**
	 * ファイル付き投稿のみに絞り込んで表示する
	 */
	withFiles?: boolean,
	/**
	 * リノートを含んで表示する。
	 * このフラグは引用リノートには作用しない。
	 */
	withRenotes?: boolean,
	/**
	 * リプライを含んで表示する。
	 * ただし、自分が作成したノートに対して自分でリプライしたノートは設定値問わず表示される。
	 */
	withReplies?: boolean,
}

function isQuote(note: MiNote | Packed<'Note'>): boolean {
	if (note.renoteId) {
		if (note.text !== null || (note.fileIds?.length ?? 0) >= 1) {
			// 本文があるか、ファイルが添付されている場合は引用扱いとする
			return true;
		}

		if (isMiNote(note) && note.hasPoll) {
			// MiNote形式の場合、投票機能が使用されていた場合も引用扱いとする
			return true;
		}
	}

	return false;
}

function isMiNote(note: MiNote | Packed<'Note'>): note is MiNote {
	const { hasPoll } = note as Record<string, unknown>;
	return hasPoll !== undefined;
}

const onlyAttachmentFilesFilter = new OnlyAttachmentFilesFilter();
const followingChannelNotesFilter = new FollowingChannelNotesFilter();
const followingUserNotesFilter = new FollowingUserNotesFilter();
const visibilityFollowingUserNotesFilter = new VisibilityFollowingUserNotesFilter();
const visibilitySpecifiedNotesFilter = new VisibilitySpecifiedNotesFilter();
const includeRepliesFilter = new IncludeRepliesFilter();
const includeRenotesFilter = new IncludeRenotesFilter();
const blockMutesFilter = new BlockMuteFilter();
const replyFollowerScopeFilter = new ReplyFollowerScopeFilter();

export const FilterPresets: { [tl: string]: IFilterPresetItem [] } = {
	home: [
		{ onlyStreaming: true, filter: onlyAttachmentFilesFilter },
		{ onlyStreaming: true, filter: followingChannelNotesFilter },
		{ onlyStreaming: true, filter: followingUserNotesFilter },
		{ onlyStreaming: true, filter: visibilityFollowingUserNotesFilter },
		{ onlyStreaming: true, filter: visibilitySpecifiedNotesFilter },
		{ onlyStreaming: false, filter: includeRepliesFilter },
		{ onlyStreaming: false, filter: includeRenotesFilter },
		{ onlyStreaming: false, filter: blockMutesFilter },
		{ onlyStreaming: false, filter: replyFollowerScopeFilter },
	],
};
