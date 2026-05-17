/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { FollowingsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'read:following',
	description: 'List of following users with notification enabled.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserDetailed',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,@inject(delay(() => UserEntityService)) private userEntityService: UserEntityService,@inject(delay(() => QueryService)) private queryService: QueryService) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.followingsRepository.createQueryBuilder('following'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.innerJoinAndSelect('following.followee', 'followee')
				.andWhere('following.followerId = :userId', { userId: me.id })
				.andWhere('following.notify IS NOT NULL');

			const followings = await query
				.limit(ps.limit)
				.getMany();

			const users = followings.map(f => f.followee!);

			return await this.userEntityService.packMany(users, me, { schema: 'UserDetailed' });
		});
	}
}
