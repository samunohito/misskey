/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { UserService } from '@/core/UserService.js';
import type { SystemWebhookService } from '@/core/SystemWebhookService.js';
import type { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import type { IdService } from '@/core/IdService.js';

describe('UserService', () => {
	describe('updateLastActiveDate', () => {
		const users = mockDeep<UsersRepository>();
		const followings = mockDeep<FollowingsRepository>();
		const systemWebhook = mockDeep<SystemWebhookService>();
		const userEntity = mockDeep<UserEntityService>();
		const fanoutTimeline = mockDeep<FanoutTimelineService>();
		const idService = mockDeep<IdService>();
		const now = 'aaaaaaaaaa';
		let service: UserService;

		// usersRepository.createQueryBuilder().update().set().where().returning().execute() が
		// raw に storedRow を返すようにする
		const stubQueryBuilder = (storedRow: { isHibernated: boolean }) => {
			// 型付きの mockDeep をチェーンすると TS2590 (union type too complex) になるため、素のオブジェクトで組む
			const chain = {
				update: () => chain,
				set: () => chain,
				where: () => chain,
				returning: () => chain,
				execute: () => Promise.resolve({ raw: [storedRow], generatedMaps: [] }),
			};
			users.createQueryBuilder.mockReturnValue(chain as unknown as ReturnType<UsersRepository['createQueryBuilder']>);
		};

		beforeEach(() => {
			mockReset(users);
			mockReset(followings);
			mockReset(systemWebhook);
			mockReset(userEntity);
			mockReset(fanoutTimeline);
			mockReset(idService);
			idService.gen.mockReturnValue(now);
			fanoutTimeline.raiseWatermark.mockResolvedValue(undefined);
			service = new UserService(
				users,
				followings as unknown as FollowingsRepository, // 型推論が TS2590 (union type too complex) になるため unknown を経由する
				systemWebhook,
				userEntity,
				fanoutTimeline,
				idService,
			);
		});

		test('raises home timeline watermarks to now when a hibernated user wakes up', async () => {
			stubQueryBuilder({ isHibernated: true });
			await service.updateLastActiveDate({ id: 'user1', isHibernated: true } as MiUser);

			expect(fanoutTimeline.raiseWatermark).toHaveBeenCalledTimes(2);
			expect(fanoutTimeline.raiseWatermark).toHaveBeenCalledWith('homeTimeline:user1', now);
			expect(fanoutTimeline.raiseWatermark).toHaveBeenCalledWith('homeTimelineWithFiles:user1', now);
		});

		test('takes the watermark id after the followings update completes', async () => {
			stubQueryBuilder({ isHibernated: true });
			let updateResolved = false;
			followings.update.mockImplementation(async () => {
				await new Promise(resolve => setImmediate(resolve));
				updateResolved = true;
				return { raw: [], affected: 0, generatedMaps: [] };
			});
			idService.gen.mockImplementation(() => {
				expect(updateResolved).toBe(true);
				return now;
			});

			await service.updateLastActiveDate({ id: 'user1', isHibernated: true } as MiUser);

			expect(idService.gen).toHaveBeenCalledTimes(1);
			expect(fanoutTimeline.raiseWatermark).toHaveBeenCalledWith('homeTimeline:user1', now);
		});

		test('swallows raiseWatermark failures because the caller does not await', async () => {
			stubQueryBuilder({ isHibernated: true });
			// vi.fn は返した Promise の結果を記録するために handler を付けるので、unhandled rejection を検出できない。素の関数で差し替える
			let calls = 0;
			const failingFanoutTimeline = {
				raiseWatermark: () => {
					calls++;
					return Promise.reject(new Error('redis down'));
				},
			} as unknown as FanoutTimelineService;
			service = new UserService(
				users,
				followings as unknown as FollowingsRepository, // 型推論が TS2590 (union type too complex) になるため unknown を経由する
				systemWebhook,
				userEntity,
				failingFanoutTimeline,
				idService,
			);

			const unhandled: unknown[] = [];
			const onUnhandled = (reason: unknown) => unhandled.push(reason);
			process.on('unhandledRejection', onUnhandled);
			try {
				await expect(service.updateLastActiveDate({ id: 'user1', isHibernated: true } as MiUser)).resolves.toBeUndefined();
				// unhandledRejection はマイクロタスクが尽きた後に発火するので、1 周待つ
				await new Promise(resolve => setImmediate(resolve));
			} finally {
				process.off('unhandledRejection', onUnhandled);
			}

			expect(calls).toBe(2);
			expect(unhandled).toEqual([]);
		});

		test('does not touch watermarks when the user was not hibernated', async () => {
			await service.updateLastActiveDate({ id: 'user1', isHibernated: false } as MiUser);

			expect(fanoutTimeline.raiseWatermark).not.toHaveBeenCalled();
		});

		test('does not touch watermarks when the stored row was not hibernated', async () => {
			stubQueryBuilder({ isHibernated: false });
			await service.updateLastActiveDate({ id: 'user1', isHibernated: true } as MiUser);

			expect(fanoutTimeline.raiseWatermark).not.toHaveBeenCalled();
		});
	});
});
