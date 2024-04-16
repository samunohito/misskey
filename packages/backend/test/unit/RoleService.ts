/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { RoleCondFormulaValue } from '@/models/Role.js';

process.env.NODE_ENV = 'test';

import { jest } from '@jest/globals';
import { ModuleMocker } from 'jest-mock';
import { Test } from '@nestjs/testing';
import * as lolex from '@sinonjs/fake-timers';
import { GlobalModule } from '@/GlobalModule.js';
import { RoleService } from '@/core/RoleService.js';
import {
	DriveFilesRepository,
	MiDriveFile, MiNote, MiNoteReaction, MiPollVote,
	MiRole,
	MiUser, MiUserProfile, MiUserSecurityKey, NoteReactionsRepository, NotesRepository,
	PollVotesRepository,
	RoleAssignmentsRepository,
	RolesRepository, UserProfilesRepository, UserSecurityKeysRepository,
	UsersRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';
import { genAidx } from '@/misc/id/aidx.js';
import { CacheService } from '@/core/CacheService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { NotificationService } from '@/core/NotificationService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { sleep } from '../utils.js';
import type { TestingModule } from '@nestjs/testing';
import type { MockFunctionMetadata } from 'jest-mock';

const moduleMocker = new ModuleMocker(global);

describe('RoleService', () => {
	let app: TestingModule;
	let roleService: RoleService;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let userSecurityLogsRepository: UserSecurityKeysRepository;
	let notesRepository: NotesRepository;
	let noteReactionRepository: NoteReactionsRepository;
	let rolesRepository: RolesRepository;
	let roleAssignmentsRepository: RoleAssignmentsRepository;
	let driveFilesRepository: DriveFilesRepository;
	let pollVotesRepository: PollVotesRepository;
	let metaService: jest.Mocked<MetaService>;
	let notificationService: jest.Mocked<NotificationService>;
	let clock: lolex.InstalledClock;

	function createUser(data: Partial<MiUser> = {}) {
		const un = secureRndstr(16);
		return usersRepository.insert({
			id: genAidx(Date.now()),
			username: un,
			usernameLower: un,
			...data,
		})
			.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));
	}

	async function createUserAndProfile(data: Partial<MiUser> = {}, profile: Partial<MiUserProfile> = {}): Promise<{
		user: MiUser,
		profile: MiUserProfile
	}> {
		const user = await createUser(data);
		const userProfile = await userProfilesRepository.insert({
			userId: user.id,
			...profile,
		})
			.then(x => userProfilesRepository.findOneByOrFail(x.identifiers[0]));

		return { user, profile: userProfile };
	}

	function createRole(data: Partial<MiRole> = {}) {
		return rolesRepository.insert({
			id: genAidx(Date.now()),
			updatedAt: new Date(),
			lastUsedAt: new Date(),
			name: '',
			description: '',
			...data,
		})
			.then(x => rolesRepository.findOneByOrFail(x.identifiers[0]));
	}

	function createConditionalRole(condFormula: RoleCondFormulaValue, data: Partial<MiRole> = {}) {
		return createRole({
			name: `[conditional] ${condFormula.type}`,
			target: 'conditional',
			condFormula: condFormula,
			...data,
		});
	}

	function createDriveFile(data: Partial<MiDriveFile> = {}) {
		return driveFilesRepository.insert({
			id: genAidx(Date.now()),
			md5: '',
			name: '',
			type: '',
			storedInternal: false,
			url: '',
			...data,
		})
			.then(x => driveFilesRepository.findOneByOrFail(x.identifiers[0]));
	}

	function createUserSecurityKey(data: Partial<MiUserSecurityKey>) {
		return userSecurityLogsRepository.insert({
			id: genAidx(Date.now()),
			publicKey: '',
			name: '',
			...data,
		})
			.then(x => userSecurityLogsRepository.findOneByOrFail(x.identifiers[0]));
	}

	function createNote(data: Partial<MiNote>) {
		return notesRepository.insert({
			id: genAidx(Date.now()),
			visibility: 'public',
			...data,
		})
			.then(x => notesRepository.findOneByOrFail(x.identifiers[0]));
	}

	function createReaction(data: Partial<MiNoteReaction>) {
		return noteReactionRepository.insert({
			id: genAidx(Date.now()),
			reaction: ':ablobcat_resonyance:',
			...data,
		})
			.then(x => noteReactionRepository.findOneByOrFail(x.identifiers[0]));
	}

	function createPollVote(data: Partial<MiPollVote>) {
		return pollVotesRepository.insert({
			id: genAidx(Date.now()),
			choice: 0,
			...data,
		})
			.then(x => pollVotesRepository.findOneByOrFail(x.identifiers[0]));
	}

	function aidx() {
		return genAidx(Date.now());
	}

	beforeEach(async () => {
		clock = lolex.install({
			now: new Date(),
			shouldClearNativeTimers: true,
		});

		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
			],
			providers: [
				LoggerService,
				DriveFileEntityService,
				UserEntityService,
				RoleService,
				CacheService,
				IdService,
				GlobalEventService,
				{
					provide: NotificationService,
					useFactory: () => ({
						createNotification: jest.fn(),
					}),
				},
				{
					provide: NotificationService.name,
					useExisting: NotificationService,
				},
			],
		})
			.useMocker((token) => {
				if (token === MetaService) {
					return { fetch: jest.fn() };
				}
				if (typeof token === 'function') {
					const mockMetadata = moduleMocker.getMetadata(token) as MockFunctionMetadata<any, any>;
					const Mock = moduleMocker.generateFromMetadata(mockMetadata);
					return new Mock();
				}
			})
			.compile();

		app.enableShutdownHooks();

		roleService = app.get<RoleService>(RoleService);
		usersRepository = app.get<UsersRepository>(DI.usersRepository);
		userProfilesRepository = app.get<UserProfilesRepository>(DI.userProfilesRepository);
		userSecurityLogsRepository = app.get<UserSecurityKeysRepository>(DI.userSecurityKeysRepository);
		notesRepository = app.get<NotesRepository>(DI.notesRepository);
		noteReactionRepository = app.get<NoteReactionsRepository>(DI.noteReactionsRepository);
		rolesRepository = app.get<RolesRepository>(DI.rolesRepository);
		roleAssignmentsRepository = app.get<RoleAssignmentsRepository>(DI.roleAssignmentsRepository);
		driveFilesRepository = app.get<DriveFilesRepository>(DI.driveFilesRepository);
		pollVotesRepository = app.get<PollVotesRepository>(DI.pollVotesRepository);

		metaService = app.get<MetaService>(MetaService) as jest.Mocked<MetaService>;
		notificationService = app.get<NotificationService>(NotificationService) as jest.Mocked<NotificationService>;

		await roleService.onModuleInit();
	});

	afterEach(async () => {
		clock.uninstall();

		// デッドロックするので1つずつ
		await app.get(DI.metasRepository).delete({});
		await usersRepository.delete({});
		await userProfilesRepository.delete({});
		await userSecurityLogsRepository.delete({});
		await notesRepository.delete({});
		await noteReactionRepository.delete({});
		await rolesRepository.delete({});
		await roleAssignmentsRepository.delete({});
		await driveFilesRepository.delete({});
		await pollVotesRepository.delete({});

		await app.close();
	});

	describe('getUserPolicies', () => {
		test('instance default policies', async () => {
			const user = await createUser();
			metaService.fetch.mockResolvedValue({
				policies: {
					canManageCustomEmojis: false,
				},
			} as any);

			const result = await roleService.getUserPolicies(user.id);

			expect(result.canManageCustomEmojis).toBe(false);
		});

		test('instance default policies 2', async () => {
			const user = await createUser();
			metaService.fetch.mockResolvedValue({
				policies: {
					canManageCustomEmojis: true,
				},
			} as any);

			const result = await roleService.getUserPolicies(user.id);

			expect(result.canManageCustomEmojis).toBe(true);
		});

		test('with role', async () => {
			const user = await createUser();
			const role = await createRole({
				name: 'a',
				policies: {
					canManageCustomEmojis: {
						useDefault: false,
						priority: 0,
						value: true,
					},
				},
			});
			await roleService.assign(user.id, role.id);
			metaService.fetch.mockResolvedValue({
				policies: {
					canManageCustomEmojis: false,
				},
			} as any);

			const result = await roleService.getUserPolicies(user.id);

			expect(result.canManageCustomEmojis).toBe(true);
		});

		test('priority', async () => {
			const user = await createUser();
			const role1 = await createRole({
				name: 'role1',
				policies: {
					driveCapacityMb: {
						useDefault: false,
						priority: 0,
						value: 200,
					},
				},
			});
			const role2 = await createRole({
				name: 'role2',
				policies: {
					driveCapacityMb: {
						useDefault: false,
						priority: 1,
						value: 100,
					},
				},
			});
			await roleService.assign(user.id, role1.id);
			await roleService.assign(user.id, role2.id);
			metaService.fetch.mockResolvedValue({
				policies: {
					driveCapacityMb: 50,
				},
			} as any);

			const result = await roleService.getUserPolicies(user.id);

			expect(result.driveCapacityMb).toBe(100);
		});

		test('conditional role', async () => {
			const user1 = await createUser({
				id: genAidx(Date.now() - (1000 * 60 * 60 * 24 * 365)),
			});
			const user2 = await createUser({
				id: genAidx(Date.now() - (1000 * 60 * 60 * 24 * 365)),
				followersCount: 10,
			});
			await createRole({
				name: 'a',
				policies: {
					canManageCustomEmojis: {
						useDefault: false,
						priority: 0,
						value: true,
					},
				},
				target: 'conditional',
				condFormula: {
					id: '232a4221-9816-49a6-a967-ae0fac52ec5e',
					type: 'and',
					values: [{
						id: '2a37ef43-2d93-4c4d-87f6-f2fdb7d9b530',
						type: 'followersMoreThanOrEq',
						count: 10,
					}, {
						id: '1bd67839-b126-4f92-bad0-4e285dab453b',
						type: 'createdMoreThan',
						sec: 60 * 60 * 24 * 7,
					}],
				},
			});

			metaService.fetch.mockResolvedValue({
				policies: {
					canManageCustomEmojis: false,
				},
			} as any);

			const user1Policies = await roleService.getUserPolicies(user1.id);
			const user2Policies = await roleService.getUserPolicies(user2.id);
			expect(user1Policies.canManageCustomEmojis).toBe(false);
			expect(user2Policies.canManageCustomEmojis).toBe(true);
		});

		test('expired role', async () => {
			const user = await createUser();
			const role = await createRole({
				name: 'a',
				policies: {
					canManageCustomEmojis: {
						useDefault: false,
						priority: 0,
						value: true,
					},
				},
			});
			await roleService.assign(user.id, role.id, new Date(Date.now() + (1000 * 60 * 60 * 24)));
			metaService.fetch.mockResolvedValue({
				policies: {
					canManageCustomEmojis: false,
				},
			} as any);

			const result = await roleService.getUserPolicies(user.id);
			expect(result.canManageCustomEmojis).toBe(true);

			clock.tick('25:00:00');

			const resultAfter25h = await roleService.getUserPolicies(user.id);
			expect(resultAfter25h.canManageCustomEmojis).toBe(false);

			await roleService.assign(user.id, role.id);

			// ストリーミング経由で反映されるまでちょっと待つ
			clock.uninstall();
			await sleep(100);

			const resultAfter25hAgain = await roleService.getUserPolicies(user.id);
			expect(resultAfter25hAgain.canManageCustomEmojis).toBe(true);
		});
	});

	describe('conditional role', () => {
		test('～かつ～', async () => {
			const [user1, user2, user3, user4] = await Promise.all([
				createUser({ isBot: true, isCat: false, isSuspended: false }),
				createUser({ isBot: false, isCat: true, isSuspended: false }),
				createUser({ isBot: true, isCat: true, isSuspended: false }),
				createUser({ isBot: false, isCat: false, isSuspended: true }),
			]);
			const role1 = await createConditionalRole({
				id: aidx(),
				type: 'isBot',
			});
			const role2 = await createConditionalRole({
				id: aidx(),
				type: 'isCat',
			});
			const role3 = await createConditionalRole({
				id: aidx(),
				type: 'isSuspended',
			});
			const role4 = await createConditionalRole({
				id: aidx(),
				type: 'and',
				values: [role1.condFormula, role2.condFormula],
			});

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			const actual3 = await roleService.getUserRoles(user3.id);
			const actual4 = await roleService.getUserRoles(user4.id);
			expect(actual1.some(r => r.id === role4.id)).toBe(false);
			expect(actual2.some(r => r.id === role4.id)).toBe(false);
			expect(actual3.some(r => r.id === role4.id)).toBe(true);
			expect(actual4.some(r => r.id === role4.id)).toBe(false);
		});

		test('～または～', async () => {
			const [user1, user2, user3, user4] = await Promise.all([
				createUser({ isBot: true, isCat: false, isSuspended: false }),
				createUser({ isBot: false, isCat: true, isSuspended: false }),
				createUser({ isBot: true, isCat: true, isSuspended: false }),
				createUser({ isBot: false, isCat: false, isSuspended: true }),
			]);
			const role1 = await createConditionalRole({
				id: aidx(),
				type: 'isBot',
			});
			const role2 = await createConditionalRole({
				id: aidx(),
				type: 'isCat',
			});
			const role3 = await createConditionalRole({
				id: aidx(),
				type: 'isSuspended',
			});
			const role4 = await createConditionalRole({
				id: aidx(),
				type: 'or',
				values: [role1.condFormula, role2.condFormula],
			});

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			const actual3 = await roleService.getUserRoles(user3.id);
			const actual4 = await roleService.getUserRoles(user4.id);
			expect(actual1.some(r => r.id === role4.id)).toBe(true);
			expect(actual2.some(r => r.id === role4.id)).toBe(true);
			expect(actual3.some(r => r.id === role4.id)).toBe(true);
			expect(actual4.some(r => r.id === role4.id)).toBe(false);
		});

		test('～ではない', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUser({ isBot: true, isCat: false, isSuspended: false }),
				createUser({ isBot: false, isCat: true, isSuspended: false }),
				createUser({ isBot: true, isCat: true, isSuspended: false }),
			]);
			const role1 = await createConditionalRole({
				id: aidx(),
				type: 'isBot',
			});
			const role2 = await createConditionalRole({
				id: aidx(),
				type: 'isCat',
			});
			const role4 = await createConditionalRole({
				id: aidx(),
				type: 'not',
				value: role1.condFormula,
			});

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			const actual3 = await roleService.getUserRoles(user3.id);
			expect(actual1.some(r => r.id === role4.id)).toBe(false);
			expect(actual2.some(r => r.id === role4.id)).toBe(true);
			expect(actual3.some(r => r.id === role4.id)).toBe(false);
		});

		test('マニュアルロールにアサイン済み', async () => {
			const [user1, user2, role1] = await Promise.all([
				createUser(),
				createUser(),
				createRole({
					name: 'manual role',
				}),
			]);
			const role2 = await createConditionalRole({
				id: aidx(),
				type: 'roleAssignedTo',
				roleId: role1.id,
			});
			await roleService.assign(user2.id, role1.id);

			const [u1role, u2role] = await Promise.all([
				roleService.getUserRoles(user1.id),
				roleService.getUserRoles(user2.id),
			]);
			expect(u1role.some(r => r.id === role2.id)).toBe(false);
			expect(u2role.some(r => r.id === role2.id)).toBe(true);
		});

		test('ローカルユーザのみ', async () => {
			const [user1, user2] = await Promise.all([
				createUser({ host: null }),
				createUser({ host: 'example.com' }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'isLocal',
			});

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(false);
		});

		test('リモートユーザのみ', async () => {
			const [user1, user2] = await Promise.all([
				createUser({ host: null }),
				createUser({ host: 'example.com' }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'isRemote',
			});

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
		});

		test('ドライブの使用容量が指定値以下', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUser(),
				createUser(),
				createUser(),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'driveUsageLessThanOrEq',
				usageSize: 100,
			});
			await Promise.all([
				createDriveFile({ userId: user1.id, size: 99 }),
				createDriveFile({ userId: user2.id, size: 100 }),
				createDriveFile({ userId: user3.id, size: 101 }),
			]);

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			const actual3 = await roleService.getUserRoles(user3.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('ドライブの使用容量が指定値以上', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUser(),
				createUser(),
				createUser(),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'driveUsageMoreThanOrEq',
				usageSize: 100,
			});
			await Promise.all([
				createDriveFile({ userId: user1.id, size: 99 }),
				createDriveFile({ userId: user2.id, size: 100 }),
				createDriveFile({ userId: user3.id, size: 101 }),
			]);

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			const actual3 = await roleService.getUserRoles(user3.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('botユーザである', async () => {
			const [user1, user2] = await Promise.all([
				createUser({ isBot: false }),
				createUser({ isBot: true }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'isBot',
			});

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
		});

		test('サスペンド済みユーザである', async () => {
			const [user1, user2] = await Promise.all([
				createUser({ isSuspended: false }),
				createUser({ isSuspended: true }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'isSuspended',
			});

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
		});

		test('猫である', async () => {
			const [user1, user2] = await Promise.all([
				createUser({ isCat: false }),
				createUser({ isCat: true }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'isCat',
			});

			const actual1 = await roleService.getUserRoles(user1.id);
			const actual2 = await roleService.getUserRoles(user2.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
		});

		test('セキュリティキー設定済み', async () => {
			const [user1, user2, user3] = await Promise.all([
				// 二段階認証設定なし
				createUserAndProfile({}, { twoFactorEnabled: false }),
				// 二段階認証設定ありだが、セキュリティキー未登録
				createUserAndProfile({}, { twoFactorEnabled: true }),
				// 二段階認証設定ありで、セキュリティキー登録済み
				createUserAndProfile({}, { twoFactorEnabled: true }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'hasSecurityKey',
			});

			await createUserSecurityKey({ userId: user3.user.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(false);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('二段階認証設定済み', async () => {
			const [user1, user2] = await Promise.all([
				createUserAndProfile({}, { twoFactorEnabled: false }),
				createUserAndProfile({}, { twoFactorEnabled: true }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'hasTwoFactorAuth',
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
		});

		test('メールアドレス確認済み', async () => {
			const [user1, user2] = await Promise.all([
				createUserAndProfile({}, { emailVerified: false }),
				createUserAndProfile({}, { emailVerified: true }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'hasEmailVerified',
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
		});

		test('パスワードレスログイン設定済み', async () => {
			const [user1, user2] = await Promise.all([
				createUserAndProfile({}, { usePasswordLessLogin: false }),
				createUserAndProfile({}, { usePasswordLessLogin: true }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'hasPasswordLessLogin',
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
		});

		test('実行時点の日付が誕生日である', async () => {
			const base = new Date();
			const d1 = new Date(base);
			const d2 = new Date(base);
			const d3 = new Date(base);
			d2.setDate(d2.getDate() + 1);
			d2.setHours(0, 0, 0, 0);
			d3.setDate(d3.getDate() - 1);
			d3.setHours(23, 59, 59, 999);

			const [user1, user2, user3] = await Promise.all([
				// 誕生日当日
				createUserAndProfile({}, { birthday: `${d1.getFullYear()}-${d1.getMonth() + 1}-${d1.getDate()}` }),
				// 誕生日の翌日
				createUserAndProfile({}, { birthday: `${d2.getFullYear()}-${d2.getMonth() + 1}-${d2.getDate()}` }),
				// 誕生日が翌日
				createUserAndProfile({}, { birthday: `${d3.getFullYear()}-${d3.getMonth() + 1}-${d3.getDate()}` }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'birthday',
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(false);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('ユーザそのものが指定日時より前に作成された', async () => {
			const base = new Date();
			base.setMinutes(base.getMinutes() - 5);

			const d1 = new Date(base);
			const d2 = new Date(base);
			const d3 = new Date(base);
			d1.setSeconds(d1.getSeconds() - 1);
			d3.setSeconds(d3.getSeconds() + 1);

			const [user1, user2, user3] = await Promise.all([
				// 4:59
				createUserAndProfile({ id: genAidx(d1.getTime()) }, {}),
				// 5:00
				createUserAndProfile({ id: genAidx(d2.getTime()) }, {}),
				// 5:01
				createUserAndProfile({ id: genAidx(d3.getTime()) }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'createdLessThan',
				// 5 minutes
				sec: 300,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(false);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('ユーザそのものが指定日時より後に作成された', async () => {
			const base = new Date();
			base.setMinutes(base.getMinutes() - 5);

			const d1 = new Date(base);
			const d2 = new Date(base);
			const d3 = new Date(base);
			d1.setSeconds(d1.getSeconds() - 1);
			d3.setSeconds(d3.getSeconds() + 1);

			const [user1, user2, user3] = await Promise.all([
				// 4:59
				createUserAndProfile({ id: genAidx(d1.getTime()) }, {}),
				// 5:00
				createUserAndProfile({ id: genAidx(d2.getTime()) }, {}),
				// 5:01
				createUserAndProfile({ id: genAidx(d3.getTime()) }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'createdMoreThan',
				// 5 minutes
				sec: 300,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(false);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('ユーザ情報が指定日時より前に更新された', async () => {
			const base = new Date();
			base.setMinutes(base.getMinutes() - 5);

			const d1 = new Date(base);
			const d2 = new Date(base);
			const d3 = new Date(base);
			d1.setSeconds(d1.getSeconds() - 1);
			d3.setSeconds(d3.getSeconds() + 1);

			const [user1, user2, user3] = await Promise.all([
				// 4:59
				createUserAndProfile({ updatedAt: d1 }, {}),
				// 5:00
				createUserAndProfile({ updatedAt: d2 }, {}),
				// 5:01
				createUserAndProfile({ updatedAt: d3 }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'userInfoUpdatedLessThan',
				// 5 minutes
				sec: 300,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(false);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('ユーザ情報が指定日時より後に更新された', async () => {
			const base = new Date();
			base.setMinutes(base.getMinutes() - 5);

			const d1 = new Date(base);
			const d2 = new Date(base);
			const d3 = new Date(base);
			d1.setSeconds(d1.getSeconds() - 1);
			d3.setSeconds(d3.getSeconds() + 1);

			const [user1, user2, user3] = await Promise.all([
				// 4:59
				createUserAndProfile({ updatedAt: d1 }, {}),
				// 5:00
				createUserAndProfile({ updatedAt: d2 }, {}),
				// 5:01
				createUserAndProfile({ updatedAt: d3 }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'userInfoUpdatedMoreThan',
				// 5 minutes
				sec: 300,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(false);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('ログイン日数が指定値以下', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, { loggedInDates: ['1000/1/1', '1000/1/2'] }),
				createUserAndProfile({}, { loggedInDates: ['1000/1/1', '1000/1/2', '1000/1/3'] }),
				createUserAndProfile({}, { loggedInDates: ['1000/1/1', '1000/1/2', '1000/1/3', '1000/1/4'] }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'loginDaysLessThanOrEq',
				day: 3,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('ログイン日数が指定値以上', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, { loggedInDates: ['1000/1/1', '1000/1/2'] }),
				createUserAndProfile({}, { loggedInDates: ['1000/1/1', '1000/1/2', '1000/1/3'] }),
				createUserAndProfile({}, { loggedInDates: ['1000/1/1', '1000/1/2', '1000/1/3', '1000/1/4'] }),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'loginDaysMoreThanOrEq',
				day: 3,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('フォロワー数が指定値以下', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({ followersCount: 99 }, {}),
				createUserAndProfile({ followersCount: 100 }, {}),
				createUserAndProfile({ followersCount: 101 }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'followersLessThanOrEq',
				count: 100,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('フォロワー数が指定値以下', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({ followersCount: 99 }, {}),
				createUserAndProfile({ followersCount: 100 }, {}),
				createUserAndProfile({ followersCount: 101 }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'followersMoreThanOrEq',
				count: 100,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('フォロー数が指定値以下', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({ followingCount: 99 }, {}),
				createUserAndProfile({ followingCount: 100 }, {}),
				createUserAndProfile({ followingCount: 101 }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'followingLessThanOrEq',
				count: 100,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('フォロー数が指定値以上', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({ followingCount: 99 }, {}),
				createUserAndProfile({ followingCount: 100 }, {}),
				createUserAndProfile({ followingCount: 101 }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'followingMoreThanOrEq',
				count: 100,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('リアクション数が指定値以下', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'reactionsLessThanOrEq',
				count: 10,
			});

			const note = await createNote({
				userId: user0.id,
				text: 'a',
			});
			for (let i = 0; i < 9; i++) await createReaction({ noteId: note.id, userId: user1.user.id });
			for (let i = 0; i < 10; i++) await createReaction({ noteId: note.id, userId: user2.user.id });
			for (let i = 0; i < 11; i++) await createReaction({ noteId: note.id, userId: user3.user.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('リアクション数が指定値以上', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'reactionsMoreThanOrEq',
				count: 10,
			});

			const note = await createNote({
				userId: user0.id,
				text: 'a',
			});
			for (let i = 0; i < 9; i++) await createReaction({ noteId: note.id, userId: user1.user.id });
			for (let i = 0; i < 10; i++) await createReaction({ noteId: note.id, userId: user2.user.id });
			for (let i = 0; i < 11; i++) await createReaction({ noteId: note.id, userId: user3.user.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('リアクション受信数が指定値以下', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'reactionsReceivedLessThanOrEq',
				count: 10,
			});

			const note1 = await createNote({ userId: user1.user.id, text: 'a' });
			const note2 = await createNote({ userId: user2.user.id, text: 'a' });
			const note3 = await createNote({ userId: user3.user.id, text: 'a' });
			for (let i = 0; i < 9; i++) await createReaction({ noteId: note1.id, userId: user0.id });
			for (let i = 0; i < 10; i++) await createReaction({ noteId: note2.id, userId: user0.id });
			for (let i = 0; i < 11; i++) await createReaction({ noteId: note3.id, userId: user0.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('リアクション受信数が指定値以上', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'reactionsReceivedMoreThanOrEq',
				count: 10,
			});

			const note1 = await createNote({ userId: user1.user.id, text: 'a' });
			const note2 = await createNote({ userId: user2.user.id, text: 'a' });
			const note3 = await createNote({ userId: user3.user.id, text: 'a' });
			for (let i = 0; i < 9; i++) await createReaction({ noteId: note1.id, userId: user0.id });
			for (let i = 0; i < 10; i++) await createReaction({ noteId: note2.id, userId: user0.id });
			for (let i = 0; i < 11; i++) await createReaction({ noteId: note3.id, userId: user0.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('リノート数が指定値以下', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'renotesLessThanOrEq',
				count: 10,
			});

			const note = await createNote({
				userId: user0.id,
				text: 'a',
			});
			for (let i = 0; i < 9; i++) await createNote({ renoteId: note.id, renoteUserId: user1.user.id });
			for (let i = 0; i < 10; i++) await createNote({ renoteId: note.id, renoteUserId: user2.user.id });
			for (let i = 0; i < 11; i++) await createNote({ renoteId: note.id, renoteUserId: user3.user.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('リノート数が指定値以上', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'renotesMoreThanOrEq',
				count: 10,
			});

			const note = await createNote({
				userId: user0.id,
				text: 'a',
			});
			for (let i = 0; i < 9; i++) await createNote({ renoteId: note.id, renoteUserId: user1.user.id });
			for (let i = 0; i < 10; i++) await createNote({ renoteId: note.id, renoteUserId: user2.user.id });
			for (let i = 0; i < 11; i++) await createNote({ renoteId: note.id, renoteUserId: user3.user.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('リノートされた数が指定値以下', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'renotesReceivedLessThanOrEq',
				count: 10,
			});

			const note1 = await createNote({ userId: user1.user.id, text: 'a' });
			const note2 = await createNote({ userId: user2.user.id, text: 'a' });
			const note3 = await createNote({ userId: user3.user.id, text: 'a' });
			for (let i = 0; i < 9; i++) await createNote({ renoteId: note1.id, renoteUserId: user0.id });
			for (let i = 0; i < 10; i++) await createNote({ renoteId: note2.id, renoteUserId: user0.id });
			for (let i = 0; i < 11; i++) await createNote({ renoteId: note3.id, renoteUserId: user0.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('リノートされた数が指定値以上', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'renotesReceivedMoreThanOrEq',
				count: 10,
			});

			const note1 = await createNote({ userId: user1.user.id, text: 'a' });
			const note2 = await createNote({ userId: user2.user.id, text: 'a' });
			const note3 = await createNote({ userId: user3.user.id, text: 'a' });
			for (let i = 0; i < 9; i++) await createNote({ renoteId: note1.id, renoteUserId: user0.id });
			for (let i = 0; i < 10; i++) await createNote({ renoteId: note2.id, renoteUserId: user0.id });
			for (let i = 0; i < 11; i++) await createNote({ renoteId: note3.id, renoteUserId: user0.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('返信数が指定値以下', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'repliesLessThanOrEq',
				count: 10,
			});

			const note = await createNote({
				userId: user0.id,
				text: 'a',
			});
			for (let i = 0; i < 9; i++) await createNote({ replyId: note.id, replyUserId: user1.user.id });
			for (let i = 0; i < 10; i++) await createNote({ replyId: note.id, replyUserId: user2.user.id });
			for (let i = 0; i < 11; i++) await createNote({ replyId: note.id, replyUserId: user3.user.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('返信数が指定値以上', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'repliesMoreThanOrEq',
				count: 10,
			});

			const note = await createNote({
				userId: user0.id,
				text: 'a',
			});
			for (let i = 0; i < 9; i++) await createNote({ replyId: note.id, replyUserId: user1.user.id });
			for (let i = 0; i < 10; i++) await createNote({ replyId: note.id, replyUserId: user2.user.id });
			for (let i = 0; i < 11; i++) await createNote({ replyId: note.id, replyUserId: user3.user.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('返信受信数が指定値以下', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'repliesReceivedLessThanOrEq',
				count: 10,
			});

			const note1 = await createNote({ userId: user1.user.id, text: 'a' });
			const note2 = await createNote({ userId: user2.user.id, text: 'a' });
			const note3 = await createNote({ userId: user3.user.id, text: 'a' });
			for (let i = 0; i < 9; i++) await createNote({ replyId: note1.id, replyUserId: user0.id });
			for (let i = 0; i < 10; i++) await createNote({ replyId: note2.id, replyUserId: user0.id });
			for (let i = 0; i < 11; i++) await createNote({ replyId: note3.id, replyUserId: user0.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('返信受信数が指定値以上', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'repliesReceivedMoreThanOrEq',
				count: 10,
			});

			const note1 = await createNote({ userId: user1.user.id, text: 'a' });
			const note2 = await createNote({ userId: user2.user.id, text: 'a' });
			const note3 = await createNote({ userId: user3.user.id, text: 'a' });
			for (let i = 0; i < 9; i++) await createNote({ replyId: note1.id, replyUserId: user0.id });
			for (let i = 0; i < 10; i++) await createNote({ replyId: note2.id, replyUserId: user0.id });
			for (let i = 0; i < 11; i++) await createNote({ replyId: note3.id, replyUserId: user0.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('ノート数が指定値以下', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({ notesCount: 9 }, {}),
				createUserAndProfile({ notesCount: 10 }, {}),
				createUserAndProfile({ notesCount: 11 }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'notesLessThanOrEq',
				count: 10,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('ノート数が指定値以上', async () => {
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({ notesCount: 9 }, {}),
				createUserAndProfile({ notesCount: 10 }, {}),
				createUserAndProfile({ notesCount: 11 }, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'notesMoreThanOrEq',
				count: 10,
			});

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('投票数が指定値以下', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'votesLessThanOrEq',
				count: 10,
			});

			const note = await createNote({
				userId: user0.id,
				text: 'a',
				hasPoll: true,
			});
			for (let i = 0; i < 9; i++) await createPollVote({ noteId: note.id, userId: user1.user.id });
			for (let i = 0; i < 10; i++) await createPollVote({ noteId: note.id, userId: user2.user.id });
			for (let i = 0; i < 11; i++) await createPollVote({ noteId: note.id, userId: user3.user.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('投票数が指定値以上', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'votesMoreThanOrEq',
				count: 10,
			});

			const note = await createNote({
				userId: user0.id,
				text: 'a',
				hasPoll: true,
			});
			for (let i = 0; i < 9; i++) await createPollVote({ noteId: note.id, userId: user1.user.id });
			for (let i = 0; i < 10; i++) await createPollVote({ noteId: note.id, userId: user2.user.id });
			for (let i = 0; i < 11; i++) await createPollVote({ noteId: note.id, userId: user3.user.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});

		test('投票受信数が指定値以下', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'votesReceivedLessThanOrEq',
				count: 10,
			});

			const note1 = await createNote({ userId: user1.user.id, text: 'a', hasPoll: true });
			const note2 = await createNote({ userId: user2.user.id, text: 'a', hasPoll: true });
			const note3 = await createNote({ userId: user3.user.id, text: 'a', hasPoll: true });
			for (let i = 0; i < 9; i++) await createPollVote({ noteId: note1.id, userId: user0.id });
			for (let i = 0; i < 10; i++) await createPollVote({ noteId: note2.id, userId: user0.id });
			for (let i = 0; i < 11; i++) await createPollVote({ noteId: note3.id, userId: user0.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(true);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(false);
		});

		test('投票受信数が指定値以上', async () => {
			const user0 = await createUser();
			const [user1, user2, user3] = await Promise.all([
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
				createUserAndProfile({}, {}),
			]);
			const role = await createConditionalRole({
				id: aidx(),
				type: 'votesReceivedMoreThanOrEq',
				count: 10,
			});

			const note1 = await createNote({ userId: user1.user.id, text: 'a', hasPoll: true });
			const note2 = await createNote({ userId: user2.user.id, text: 'a', hasPoll: true });
			const note3 = await createNote({ userId: user3.user.id, text: 'a', hasPoll: true });
			for (let i = 0; i < 9; i++) await createPollVote({ noteId: note1.id, userId: user0.id });
			for (let i = 0; i < 10; i++) await createPollVote({ noteId: note2.id, userId: user0.id });
			for (let i = 0; i < 11; i++) await createPollVote({ noteId: note3.id, userId: user0.id });

			const actual1 = await roleService.getUserRoles(user1.user.id);
			const actual2 = await roleService.getUserRoles(user2.user.id);
			const actual3 = await roleService.getUserRoles(user3.user.id);
			expect(actual1.some(r => r.id === role.id)).toBe(false);
			expect(actual2.some(r => r.id === role.id)).toBe(true);
			expect(actual3.some(r => r.id === role.id)).toBe(true);
		});
	});

	describe('assign', () => {
		test('公開ロールの場合は通知される', async () => {
			const user = await createUser();
			const role = await createRole({
				isPublic: true,
				name: 'a',
			});

			await roleService.assign(user.id, role.id);

			clock.uninstall();
			await sleep(100);

			const assignments = await roleAssignmentsRepository.find({
				where: {
					userId: user.id,
					roleId: role.id,
				},
			});
			expect(assignments).toHaveLength(1);

			expect(notificationService.createNotification).toHaveBeenCalled();
			expect(notificationService.createNotification.mock.lastCall![0]).toBe(user.id);
			expect(notificationService.createNotification.mock.lastCall![1]).toBe('roleAssigned');
			expect(notificationService.createNotification.mock.lastCall![2]).toEqual({
				roleId: role.id,
			});
		});

		test('非公開ロールの場合は通知されない', async () => {
			const user = await createUser();
			const role = await createRole({
				isPublic: false,
				name: 'a',
			});

			await roleService.assign(user.id, role.id);

			clock.uninstall();
			await sleep(100);

			const assignments = await roleAssignmentsRepository.find({
				where: {
					userId: user.id,
					roleId: role.id,
				},
			});
			expect(assignments).toHaveLength(1);

			expect(notificationService.createNotification).not.toHaveBeenCalled();
		});
	});
});
