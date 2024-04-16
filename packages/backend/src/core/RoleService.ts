/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import type {
	MiRole,
	MiRoleAssignment,
	NoteReactionsRepository,
	NotesRepository,
	PollVotesRepository,
	RoleAssignmentsRepository,
	RolesRepository,
	UserProfilesRepository,
	UserSecurityKeysRepository,
	UsersRepository,
} from '@/models/_.js';
import { MemoryKVCache, MemorySingleCache } from '@/misc/cache.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import { CacheService } from '@/core/CacheService.js';
import type { RoleCondFormulaValue } from '@/models/Role.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import type { Packed } from '@/misc/json-schema.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { LoggerService } from '@/core/LoggerService.js';
import Logger from '@/logger.js';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';

export type RolePolicies = {
	gtlAvailable: boolean;
	ltlAvailable: boolean;
	canPublicNote: boolean;
	mentionLimit: number;
	canInvite: boolean;
	inviteLimit: number;
	inviteLimitCycle: number;
	inviteExpirationTime: number;
	canManageCustomEmojis: boolean;
	canManageAvatarDecorations: boolean;
	canSearchNotes: boolean;
	canUseTranslator: boolean;
	canHideAds: boolean;
	driveCapacityMb: number;
	alwaysMarkNsfw: boolean;
	pinLimit: number;
	antennaLimit: number;
	wordMuteLimit: number;
	webhookLimit: number;
	clipLimit: number;
	noteEachClipsLimit: number;
	userListLimit: number;
	userEachUserListsLimit: number;
	rateLimitFactor: number;
	avatarDecorationLimit: number;
};

export const DEFAULT_POLICIES: RolePolicies = {
	gtlAvailable: true,
	ltlAvailable: true,
	canPublicNote: true,
	mentionLimit: 20,
	canInvite: false,
	inviteLimit: 0,
	inviteLimitCycle: 60 * 24 * 7,
	inviteExpirationTime: 0,
	canManageCustomEmojis: false,
	canManageAvatarDecorations: false,
	canSearchNotes: false,
	canUseTranslator: true,
	canHideAds: false,
	driveCapacityMb: 100,
	alwaysMarkNsfw: false,
	pinLimit: 5,
	antennaLimit: 5,
	wordMuteLimit: 200,
	webhookLimit: 3,
	clipLimit: 10,
	noteEachClipsLimit: 200,
	userListLimit: 10,
	userEachUserListsLimit: 50,
	rateLimitFactor: 1,
	avatarDecorationLimit: 1,
};

@Injectable()
export class RoleService implements OnApplicationShutdown, OnModuleInit {
	private logger: Logger;
	private rolesCache: MemorySingleCache<MiRole[]>;
	private roleAssignmentByUserIdCache: MemoryKVCache<MiRoleAssignment[]>;
	private notificationService: NotificationService;

	public static AlreadyAssignedError = class extends Error {
	};
	public static NotAssignedError = class extends Error {
	};

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,

		@Inject(DI.roleAssignmentsRepository)
		private roleAssignmentsRepository: RoleAssignmentsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userSecurityKeysRepository)
		private userSecurityKeysRepository: UserSecurityKeysRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionRepository: NoteReactionsRepository,

		@Inject(DI.pollVotesRepository)
		private pollVotesRepository: PollVotesRepository,

		private loggerService: LoggerService,
		private metaService: MetaService,
		private cacheService: CacheService,
		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private globalEventService: GlobalEventService,
		private idService: IdService,
		private moderationLogService: ModerationLogService,
		private fanoutTimelineService: FanoutTimelineService,
	) {
		this.logger = this.loggerService.getLogger('role');
		this.rolesCache = new MemorySingleCache<MiRole[]>(1000 * 60 * 60 * 1);
		this.roleAssignmentByUserIdCache = new MemoryKVCache<MiRoleAssignment[]>(1000 * 60 * 60 * 1);

		this.redisForSub.on('message', this.onMessage);
	}

	async onModuleInit() {
		this.notificationService = this.moduleRef.get(NotificationService.name);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'roleCreated': {
					const cached = this.rolesCache.get();
					if (cached) {
						cached.push({
							...body,
							updatedAt: new Date(body.updatedAt),
							lastUsedAt: new Date(body.lastUsedAt),
						});
					}
					break;
				}
				case 'roleUpdated': {
					const cached = this.rolesCache.get();
					if (cached) {
						const i = cached.findIndex(x => x.id === body.id);
						if (i > -1) {
							cached[i] = {
								...body,
								updatedAt: new Date(body.updatedAt),
								lastUsedAt: new Date(body.lastUsedAt),
							};
						}
					}
					break;
				}
				case 'roleDeleted': {
					const cached = this.rolesCache.get();
					if (cached) {
						this.rolesCache.set(cached.filter(x => x.id !== body.id));
					}
					break;
				}
				case 'userRoleAssigned': {
					const cached = this.roleAssignmentByUserIdCache.get(body.userId);
					if (cached) {
						cached.push({ // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
							...body,
							expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
							user: null, // joinなカラムは通常取ってこないので
							role: null, // joinなカラムは通常取ってこないので
						});
					}
					break;
				}
				case 'userRoleUnassigned': {
					const cached = this.roleAssignmentByUserIdCache.get(body.userId);
					if (cached) {
						this.roleAssignmentByUserIdCache.set(body.userId, cached.filter(x => x.id !== body.id));
					}
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	private async evalCond(user: MiUser, manualAssignedRoles: MiRole[], value: RoleCondFormulaValue): Promise<boolean> {
		const fetchUserProfile = async () => {
			return await this.cacheService.userProfileCache.get(user.id)
				?? await this.userProfilesRepository.findOneBy({ userId: user.id });
		};

		const fetchReactionsCount = () => {
			return this.noteReactionRepository.createQueryBuilder('reaction')
				.where('reaction.userId = :userId', { userId: user.id })
				.getCount();
		};

		const fetchReactionsReceivedCount = () => {
			return this.noteReactionRepository.createQueryBuilder('reaction')
				.innerJoin('reaction.note', 'note')
				.where('note.userId = :userId', { userId: user.id })
				.getCount();
		};

		const fetchRenotesCount = () => {
			return this.notesRepository.createQueryBuilder('note')
				.where('note.userId = :userId', { userId: user.id })
				.andWhere('note.renoteId IS NOT NULL')
				.getCount();
		};

		const fetchRenotesReceivedCount = () => {
			return this.notesRepository.createQueryBuilder('note')
				.where('note.renoteUserId = :userId', { userId: user.id })
				.getCount();
		};

		const fetchRepliesCount = () => {
			return this.notesRepository.createQueryBuilder('note')
				.where('note.userId = :userId', { userId: user.id })
				.andWhere('note.replyId IS NOT NULL')
				.getCount();
		};

		const fetchRepliesReceivedCount = () => {
			return this.notesRepository.createQueryBuilder('note')
				.where('note.replyUserId = :userId', { userId: user.id })
				.getCount();
		};

		const fetchVotesCount = () => {
			return this.pollVotesRepository.createQueryBuilder('vote')
				.where('vote.userId = :userId', { userId: user.id })
				.getCount();
		};

		const fetchVotesReceivedCount = () => {
			return this.pollVotesRepository.createQueryBuilder('vote')
				.innerJoin('vote.poll', 'poll')
				.where('poll.userId = :userId', { userId: user.id })
				.getCount();
		};

		try {
			switch (value.type) {
				// ～かつ～
				case 'and': {
					for (const v of value.values) {
						if (!await this.evalCond(user, manualAssignedRoles, v)) {
							return false;
						}
					}

					return true;
				}
				// ～または～
				case 'or': {
					for (const v of value.values) {
						if (await this.evalCond(user, manualAssignedRoles, v)) {
							return true;
						}
					}

					return false;
				}
				// ～ではない
				case 'not': {
					return !(await this.evalCond(user, manualAssignedRoles, value.value));
				}
				// マニュアルロールがアサインされている
				case 'roleAssignedTo': {
					return manualAssignedRoles.some(r => r.id === value.roleId);
				}
				// ローカルユーザのみ
				case 'isLocal': {
					return this.userEntityService.isLocalUser(user);
				}
				// リモートユーザのみ
				case 'isRemote': {
					return this.userEntityService.isRemoteUser(user);
				}
				// ドライブの使用容量が指定値以下
				case 'driveUsageLessThanOrEq': {
					return (await this.driveFileEntityService.calcDriveUsageOf(user.id)) <= value.usageSize;
				}
				// ドライブの使用容量が指定値以上
				case 'driveUsageMoreThanOrEq': {
					return (await this.driveFileEntityService.calcDriveUsageOf(user.id)) >= value.usageSize;
				}
				// botユーザである
				case 'isBot': {
					return user.isBot;
				}
				// サスペンド済みユーザである
				case 'isSuspended': {
					return user.isSuspended;
				}
				// 猫である
				case 'isCat': {
					return user.isCat;
				}
				// セキュリティキー設定済み
				case 'hasSecurityKey': {
					const profile = await fetchUserProfile();
					if (!profile) {
						return false;
					}

					// UserEntityServiceのsecurityKeys取得時と同じ処理を行う
					return profile.twoFactorEnabled
						? this.userSecurityKeysRepository.countBy({ userId: user.id }).then(result => result >= 1)
						: false;
				}
				// 二段階認証設定済み
				case 'hasTwoFactorAuth': {
					const profile = await fetchUserProfile();
					return profile ? profile.twoFactorEnabled : false;
				}
				// メールアドレス確認済み
				case 'hasEmailVerified': {
					const profile = await fetchUserProfile();
					return profile ? profile.emailVerified : false;
				}
				// パスワードレスログイン設定済み
				case 'hasPasswordLessLogin': {
					const profile = await fetchUserProfile();
					return profile ? profile.usePasswordLessLogin : false;
				}
				// 実行時点の日付が誕生日である
				case 'birthday': {
					const profile = await fetchUserProfile();
					if (!profile || !profile.birthday) {
						return false;
					}

					const now = new Date();
					const birthday = new Date(profile.birthday);
					return now.getMonth() === birthday.getMonth() && now.getDate() === birthday.getDate();
				}
				// ユーザそのものが指定日時より前に作成された
				case 'createdLessThan': {
					return this.idService.parse(user.id).date.getTime() > (Date.now() - (value.sec * 1000));
				}
				// ユーザそのものが指定日時より後に作成された
				case 'createdMoreThan': {
					return this.idService.parse(user.id).date.getTime() < (Date.now() - (value.sec * 1000));
				}
				// ユーザ情報が指定日時より前に更新された
				case 'userInfoUpdatedLessThan': {
					if (!user.updatedAt) {
						return false;
					}

					return user.updatedAt.getTime() > (Date.now() - (value.sec * 1000));
				}
				// ユーザ情報が指定日時より後に更新された
				case 'userInfoUpdatedMoreThan': {
					if (!user.updatedAt) {
						return false;
					}

					return user.updatedAt.getTime() < (Date.now() - (value.sec * 1000));
				}
				// ログイン日数が指定値以下
				case 'loginDaysLessThanOrEq': {
					const profile = await fetchUserProfile();
					if (!profile) {
						return false;
					}

					return profile.loggedInDates.length >= value.day;
				}
				// ログイン日数が指定値以上
				case 'loginDaysMoreThanOrEq': {
					const profile = await fetchUserProfile();
					if (!profile) {
						return false;
					}

					return profile.loggedInDates.length <= value.day;
				}
				// フォロワー数が指定値以下
				case 'followersLessThanOrEq': {
					return user.followersCount <= value.count;
				}
				// フォロワー数が指定値以上
				case 'followersMoreThanOrEq': {
					return user.followersCount >= value.count;
				}
				// フォロー数が指定値以下
				case 'followingLessThanOrEq': {
					return user.followingCount <= value.count;
				}
				// フォロー数が指定値以上
				case 'followingMoreThanOrEq': {
					return user.followingCount >= value.count;
				}
				// リアクション数が指定値以下
				case 'reactionsLessThanOrEq': {
					const count = await fetchReactionsCount();
					return count <= value.count;
				}
				// リアクション数が指定値以上
				case 'reactionsMoreThanOrEq': {
					const count = await fetchReactionsCount();
					return count >= value.count;
				}
				// リアクション受信数が指定値以下
				case 'reactionsReceivedLessThanOrEq': {
					const count = await fetchReactionsReceivedCount();
					return count <= value.count;
				}
				// リアクション受信数が指定値以上
				case 'reactionsReceivedMoreThanOrEq': {
					const count = await fetchReactionsReceivedCount();
					return count >= value.count;
				}
				// リノート数が指定値以下
				case 'renotesLessThanOrEq': {
					const count = await fetchRenotesCount();
					return count <= value.count;
				}
				// リノート数が指定値以上
				case 'renotesMoreThanOrEq': {
					const count = await fetchRenotesCount();
					return count >= value.count;
				}
				// リノートされた数が指定値以下
				case 'renotesReceivedLessThanOrEq': {
					const count = await fetchRenotesReceivedCount();
					return count <= value.count;
				}
				// リノートされた数が指定値以上
				case 'renotesReceivedMoreThanOrEq': {
					const count = await fetchRenotesReceivedCount();
					return count >= value.count;
				}
				// 返信数が指定値以下
				case 'repliesLessThanOrEq': {
					const count = await fetchRepliesCount();
					return count <= value.count;
				}
				// 返信数が指定値以上
				case 'repliesMoreThanOrEq': {
					const count = await fetchRepliesCount();
					return count >= value.count;
				}
				// 返信受信数が指定値以下
				case 'repliesReceivedLessThanOrEq': {
					const count = await fetchRepliesReceivedCount();
					return count <= value.count;
				}
				// 返信受信数が指定値以上
				case 'repliesReceivedMoreThanOrEq': {
					const count = await fetchRepliesReceivedCount();
					return count >= value.count;
				}
				// ノート数が指定値以下
				case 'notesLessThanOrEq': {
					return user.notesCount <= value.count;
				}
				// ノート数が指定値以上
				case 'notesMoreThanOrEq': {
					return user.notesCount >= value.count;
				}
				// 投票数が指定値以下
				case 'votesLessThanOrEq': {
					const count = await fetchVotesCount();
					return count <= value.count;
				}
				// 投票数が指定値以上
				case 'votesMoreThanOrEq': {
					const count = await fetchVotesCount();
					return count >= value.count;
				}
				// 投票受信数が指定値以下
				case 'votesReceivedLessThanOrEq': {
					const count = await fetchVotesReceivedCount();
					return count <= value.count;
				}
				// 投票受信数が指定値以上
				case 'votesReceivedMoreThanOrEq': {
					const count = await fetchVotesReceivedCount();
					return count >= value.count;
				}
				default: {
					return false;
				}
			}
		} catch (err) {
			this.logger.error(err as Error);
			return false;
		}
	}

	@bindThis
	public async getRoles() {
		return this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
	}

	@bindThis
	public async getUserAssigns(userId: MiUser['id']) {
		const now = Date.now();
		let assigns = await this.roleAssignmentByUserIdCache.fetch(userId, () => this.roleAssignmentsRepository.findBy({ userId }));
		// 期限切れのロールを除外
		assigns = assigns.filter(a => a.expiresAt == null || (a.expiresAt.getTime() > now));
		return assigns;
	}

	@bindThis
	public async getUserRoles(userId: MiUser['id']) {
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		const assigns = await this.getUserAssigns(userId);
		const manualAssignedRoles = roles.filter(r => assigns.map(x => x.roleId).includes(r.id));

		const conditionalRoles = roles.filter(r => r.target === 'conditional');
		if (conditionalRoles.length > 0) {
			const user = await this.cacheService.findUserById(userId);
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (!user) {
				// 型の上では必ず存在することになっているが、別契機で物理削除されているケースも考えられるため
				return manualAssignedRoles;
			}

			const matchedConditionalRoles = Array.of<MiRole>();
			for (const r of conditionalRoles) {
				if (await this.evalCond(user, manualAssignedRoles, r.condFormula)) {
					matchedConditionalRoles.push(r);
				}
			}

			return [...manualAssignedRoles, ...matchedConditionalRoles];
		} else {
			return manualAssignedRoles;
		}
	}

	/**
	 * 指定ユーザーのバッジロール一覧取得
	 */
	@bindThis
	public async getUserBadgeRoles(userId: MiUser['id']) {
		const now = Date.now();
		let assigns = await this.roleAssignmentByUserIdCache.fetch(userId, () => this.roleAssignmentsRepository.findBy({ userId }));
		// 期限切れのロールを除外
		assigns = assigns.filter(a => a.expiresAt == null || (a.expiresAt.getTime() > now));
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		const assignedRoles = roles.filter(r => assigns.map(x => x.roleId).includes(r.id));
		const assignedBadgeRoles = assignedRoles.filter(r => r.asBadge);
		const badgeCondRoles = roles.filter(r => r.asBadge && (r.target === 'conditional'));
		if (badgeCondRoles.length > 0) {
			const user = await this.cacheService.findUserById(userId);
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (!user) {
				// 型の上では必ず存在することになっているが、別契機で物理削除されているケースも考えられるため
				return assignedBadgeRoles;
			}

			const matchedBadgeCondRoles = Array.of<MiRole>();
			for (const r of badgeCondRoles) {
				if (await this.evalCond(user, assignedBadgeRoles, r.condFormula)) {
					matchedBadgeCondRoles.push(r);
				}
			}

			return [...assignedBadgeRoles, ...matchedBadgeCondRoles];
		} else {
			return assignedBadgeRoles;
		}
	}

	@bindThis
	public async getUserPolicies(userId: MiUser['id'] | null): Promise<RolePolicies> {
		const meta = await this.metaService.fetch();
		const basePolicies = { ...DEFAULT_POLICIES, ...meta.policies };

		if (userId == null) return basePolicies;

		const roles = await this.getUserRoles(userId);

		function calc<T extends keyof RolePolicies>(name: T, aggregate: (values: RolePolicies[T][]) => RolePolicies[T]) {
			if (roles.length === 0) return basePolicies[name];

			const policies = roles.map(role => role.policies[name] ?? { priority: 0, useDefault: true });

			const p2 = policies.filter(policy => policy.priority === 2);
			if (p2.length > 0) return aggregate(p2.map(policy => policy.useDefault ? basePolicies[name] : policy.value));

			const p1 = policies.filter(policy => policy.priority === 1);
			if (p1.length > 0) return aggregate(p1.map(policy => policy.useDefault ? basePolicies[name] : policy.value));

			return aggregate(policies.map(policy => policy.useDefault ? basePolicies[name] : policy.value));
		}

		return {
			gtlAvailable: calc('gtlAvailable', vs => vs.some(v => v === true)),
			ltlAvailable: calc('ltlAvailable', vs => vs.some(v => v === true)),
			canPublicNote: calc('canPublicNote', vs => vs.some(v => v === true)),
			mentionLimit: calc('mentionLimit', vs => Math.max(...vs)),
			canInvite: calc('canInvite', vs => vs.some(v => v === true)),
			inviteLimit: calc('inviteLimit', vs => Math.max(...vs)),
			inviteLimitCycle: calc('inviteLimitCycle', vs => Math.max(...vs)),
			inviteExpirationTime: calc('inviteExpirationTime', vs => Math.max(...vs)),
			canManageCustomEmojis: calc('canManageCustomEmojis', vs => vs.some(v => v === true)),
			canManageAvatarDecorations: calc('canManageAvatarDecorations', vs => vs.some(v => v === true)),
			canSearchNotes: calc('canSearchNotes', vs => vs.some(v => v === true)),
			canUseTranslator: calc('canUseTranslator', vs => vs.some(v => v === true)),
			canHideAds: calc('canHideAds', vs => vs.some(v => v === true)),
			driveCapacityMb: calc('driveCapacityMb', vs => Math.max(...vs)),
			alwaysMarkNsfw: calc('alwaysMarkNsfw', vs => vs.some(v => v === true)),
			pinLimit: calc('pinLimit', vs => Math.max(...vs)),
			antennaLimit: calc('antennaLimit', vs => Math.max(...vs)),
			wordMuteLimit: calc('wordMuteLimit', vs => Math.max(...vs)),
			webhookLimit: calc('webhookLimit', vs => Math.max(...vs)),
			clipLimit: calc('clipLimit', vs => Math.max(...vs)),
			noteEachClipsLimit: calc('noteEachClipsLimit', vs => Math.max(...vs)),
			userListLimit: calc('userListLimit', vs => Math.max(...vs)),
			userEachUserListsLimit: calc('userEachUserListsLimit', vs => Math.max(...vs)),
			rateLimitFactor: calc('rateLimitFactor', vs => Math.max(...vs)),
			avatarDecorationLimit: calc('avatarDecorationLimit', vs => Math.max(...vs)),
		};
	}

	@bindThis
	public async isModerator(user: { id: MiUser['id']; isRoot: MiUser['isRoot'] } | null): Promise<boolean> {
		if (user == null) return false;
		return user.isRoot || (await this.getUserRoles(user.id)).some(r => r.isModerator || r.isAdministrator);
	}

	@bindThis
	public async isAdministrator(user: { id: MiUser['id']; isRoot: MiUser['isRoot'] } | null): Promise<boolean> {
		if (user == null) return false;
		return user.isRoot || (await this.getUserRoles(user.id)).some(r => r.isAdministrator);
	}

	@bindThis
	public async isExplorable(role: { id: MiRole['id'] } | null): Promise<boolean> {
		if (role == null) return false;
		const check = await this.rolesRepository.findOneBy({ id: role.id });
		if (check == null) return false;
		return check.isExplorable;
	}

	@bindThis
	public async getModeratorIds(includeAdmins = true): Promise<MiUser['id'][]> {
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		const moderatorRoles = includeAdmins ? roles.filter(r => r.isModerator || r.isAdministrator) : roles.filter(r => r.isModerator);
		const assigns = moderatorRoles.length > 0 ? await this.roleAssignmentsRepository.findBy({
			roleId: In(moderatorRoles.map(r => r.id)),
		}) : [];
		// TODO: isRootなアカウントも含める
		return assigns.map(a => a.userId);
	}

	@bindThis
	public async getModerators(includeAdmins = true): Promise<MiUser[]> {
		const ids = await this.getModeratorIds(includeAdmins);
		const users = ids.length > 0 ? await this.usersRepository.findBy({
			id: In(ids),
		}) : [];
		return users;
	}

	@bindThis
	public async getAdministratorIds(): Promise<MiUser['id'][]> {
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		const administratorRoles = roles.filter(r => r.isAdministrator);
		const assigns = administratorRoles.length > 0 ? await this.roleAssignmentsRepository.findBy({
			roleId: In(administratorRoles.map(r => r.id)),
		}) : [];
		// TODO: isRootなアカウントも含める
		return assigns.map(a => a.userId);
	}

	@bindThis
	public async getAdministrators(): Promise<MiUser[]> {
		const ids = await this.getAdministratorIds();
		const users = ids.length > 0 ? await this.usersRepository.findBy({
			id: In(ids),
		}) : [];
		return users;
	}

	@bindThis
	public async assign(userId: MiUser['id'], roleId: MiRole['id'], expiresAt: Date | null = null, moderator?: MiUser): Promise<void> {
		const now = Date.now();

		const role = await this.rolesRepository.findOneByOrFail({ id: roleId });

		const existing = await this.roleAssignmentsRepository.findOneBy({
			roleId: roleId,
			userId: userId,
		});

		if (existing) {
			if (existing.expiresAt && (existing.expiresAt.getTime() < now)) {
				await this.roleAssignmentsRepository.delete({
					roleId: roleId,
					userId: userId,
				});
			} else {
				throw new RoleService.AlreadyAssignedError();
			}
		}

		const created = await this.roleAssignmentsRepository.insert({
			id: this.idService.gen(now),
			expiresAt: expiresAt,
			roleId: roleId,
			userId: userId,
		}).then(x => this.roleAssignmentsRepository.findOneByOrFail(x.identifiers[0]));

		this.rolesRepository.update(roleId, {
			lastUsedAt: new Date(),
		});

		this.globalEventService.publishInternalEvent('userRoleAssigned', created);

		if (role.isPublic) {
			this.notificationService.createNotification(userId, 'roleAssigned', {
				roleId: roleId,
			});
		}

		if (moderator) {
			const user = await this.usersRepository.findOneByOrFail({ id: userId });
			this.moderationLogService.log(moderator, 'assignRole', {
				roleId: roleId,
				roleName: role.name,
				userId: userId,
				userUsername: user.username,
				userHost: user.host,
				expiresAt: expiresAt ? expiresAt.toISOString() : null,
			});
		}
	}

	@bindThis
	public async unassign(userId: MiUser['id'], roleId: MiRole['id'], moderator?: MiUser): Promise<void> {
		const now = new Date();

		const existing = await this.roleAssignmentsRepository.findOneBy({ roleId, userId });
		if (existing == null) {
			throw new RoleService.NotAssignedError();
		} else if (existing.expiresAt && (existing.expiresAt.getTime() < now.getTime())) {
			await this.roleAssignmentsRepository.delete({
				roleId: roleId,
				userId: userId,
			});
			throw new RoleService.NotAssignedError();
		}

		await this.roleAssignmentsRepository.delete(existing.id);

		this.rolesRepository.update(roleId, {
			lastUsedAt: now,
		});

		this.globalEventService.publishInternalEvent('userRoleUnassigned', existing);

		if (moderator) {
			const [user, role] = await Promise.all([
				this.usersRepository.findOneByOrFail({ id: userId }),
				this.rolesRepository.findOneByOrFail({ id: roleId }),
			]);
			this.moderationLogService.log(moderator, 'unassignRole', {
				roleId: roleId,
				roleName: role.name,
				userId: userId,
				userUsername: user.username,
				userHost: user.host,
			});
		}
	}

	@bindThis
	public async addNoteToRoleTimeline(note: Packed<'Note'>): Promise<void> {
		const roles = await this.getUserRoles(note.userId);

		const redisPipeline = this.redisForTimelines.pipeline();

		for (const role of roles) {
			this.fanoutTimelineService.push(`roleTimeline:${role.id}`, note.id, 1000, redisPipeline);
			this.globalEventService.publishRoleTimelineStream(role.id, 'note', note);
		}

		redisPipeline.exec();
	}

	@bindThis
	public async create(values: Partial<MiRole>, moderator?: MiUser): Promise<MiRole> {
		const date = new Date();
		const created = await this.rolesRepository.insert({
			id: this.idService.gen(date.getTime()),
			updatedAt: date,
			lastUsedAt: date,
			name: values.name,
			description: values.description,
			color: values.color,
			iconUrl: values.iconUrl,
			target: values.target,
			condFormula: values.condFormula,
			isPublic: values.isPublic,
			isAdministrator: values.isAdministrator,
			isModerator: values.isModerator,
			isExplorable: values.isExplorable,
			asBadge: values.asBadge,
			canEditMembersByModerator: values.canEditMembersByModerator,
			displayOrder: values.displayOrder,
			policies: values.policies,
		}).then(x => this.rolesRepository.findOneByOrFail(x.identifiers[0]));

		this.globalEventService.publishInternalEvent('roleCreated', created);

		if (moderator) {
			this.moderationLogService.log(moderator, 'createRole', {
				roleId: created.id,
				role: created,
			});
		}

		return created;
	}

	@bindThis
	public async update(role: MiRole, params: Partial<MiRole>, moderator?: MiUser): Promise<void> {
		const date = new Date();
		await this.rolesRepository.update(role.id, {
			updatedAt: date,
			...params,
		});

		const updated = await this.rolesRepository.findOneByOrFail({ id: role.id });
		this.globalEventService.publishInternalEvent('roleUpdated', updated);

		if (moderator) {
			this.moderationLogService.log(moderator, 'updateRole', {
				roleId: role.id,
				before: role,
				after: updated,
			});
		}
	}

	@bindThis
	public async delete(role: MiRole, moderator?: MiUser): Promise<void> {
		await this.rolesRepository.delete({ id: role.id });
		this.globalEventService.publishInternalEvent('roleDeleted', role);

		if (moderator) {
			this.moderationLogService.log(moderator, 'deleteRole', {
				roleId: role.id,
				role: role,
			});
		}
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
		this.roleAssignmentByUserIdCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
