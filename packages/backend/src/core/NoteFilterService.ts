// noinspection RedundantIfStatementJS

import { Injectable } from '@nestjs/common';
import { Connection } from 'misskey-js/built/streaming.js';
import { CacheService } from '@/core/CacheService.js';
import { MiNote } from '@/models/Note.js';
import { Packed } from '@/misc/json-schema.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { MiLocalUser } from '@/models/User.js';
import { MiFollowing } from '@/models/Following.js';

@Injectable()
export class NoteFilterService {
	constructor(
		private cacheService: CacheService,
	) {
	}
}

export const FilterPresets: { [tl: string]: IFilterPresetItem [] } = {
	home: [
		{ onlyStreaming: true, filter: onlyAttachmentFiles },
		{ onlyStreaming: true, filter: followingChannelNotes },
		{ onlyStreaming: true, filter: followingUserNotes },
		{ onlyStreaming: true, filter: visibilityFollowingUserNotes },
		{ onlyStreaming: true, filter: visibilitySpecifiedNotes },
		{ onlyStreaming: false, filter: includeReplies },
		{ onlyStreaming: false, filter: includeRenotes },
		{ onlyStreaming: false, filter: blockMutes },
		{ onlyStreaming: false, filter: replyFollowerScope },
	],
};

export async function filterSourceFactory(me: MiLocalUser | null, source: CacheService | Connection, filterPresets: IFilterPresetItem[]): IFilterSource {
	if (isCacheService(source)) {
		const hasBlockMutes = filterPresets.filter(it => it.filter === blockMutes).length >= 1;

		const [
			userIdsWhoMeMuting,
			userIdsWhoMeMutingRenotes,
			userIdsWhoBlockingMe,
			instancesMuting,
		] = (me && hasBlockMutes) ? await Promise.all([
			source.userMutingsCache.fetch(me.id),
			source.renoteMutingsCache.fetch(me.id),
			source.userBlockedCache.fetch(me.id),
			Promise.resolve(new Set<string>), // TODO
		]) : [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];

		return {
			userIdsWhoBlockingMe: userIdsWhoBlockingMe,
			userIdsWhoMeMuting: userIdsWhoMeMuting,
			userIdsWhoMeMutingRenotes: userIdsWhoMeMutingRenotes,
			instancesMuting: instancesMuting,
			following: null,
			followingChannels: null,
		};
	} else {

	}
}

function isCacheService(source: CacheService | Connection): source is CacheService {
	const { userByIdCache } = source as Record<keyof CacheService, unknown>;
	return userByIdCache !== undefined;
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

function includeRenotes(params: IFilterParams): boolean {
	const { note, options } = params;

	if (!options.withRenotes && !isQuote(note)) {
		// 引用リノートでないものは許可しない
		return false;
	}

	return true;
}

function includeReplies(params: IFilterParams): boolean {
	const { me, note, options } = params;

	if (!options.withReplies) {
		const reply = note.reply;
		if (reply && reply.userId !== note.userId && (me === null || reply.userId !== me.id)) {
			// リプライ先が自分の作成したノートではない場合は許可しない
			return false;
		}
	}

	return true;
}

function followingChannelNotes(params: IFilterParams): boolean {
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

function followingUserNotes(params: IFilterParams): boolean {
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

function visibilityFollowingUserNotes(params: IFilterParams): boolean {
	const { note } = params;

	if (note.visibility !== 'followers') {
		// そもそもフォロワー限定投稿ではない
		return true;
	}

	return followingUserNotes(params);
}

function visibilitySpecifiedNotes(params: IFilterParams): boolean {
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

function replyFollowerScope(params: IFilterParams): boolean {
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

export type NoteFilter = (params: IFilterParams) => boolean;

export interface IFilterPresetItem {
	onlyStreaming: boolean,
	filter: NoteFilter,
}

interface IFilterParams {
	me: MiLocalUser | null;
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
