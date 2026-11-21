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
