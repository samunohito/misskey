/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import type { PagesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { PageEntityService } from '@/core/entities/PageEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['pages'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Page',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.pagesRepository)
		private pagesRepository: PagesRepository,@inject(delay(() => PageEntityService)) private pageEntityService: PageEntityService) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.pagesRepository.createQueryBuilder('page')
				.where('page.visibility = \'public\'')
				.andWhere('page.likedCount > 0')
				.orderBy('page.likedCount', 'DESC');

			const pages = await query.limit(10).getMany();

			return await this.pageEntityService.packMany(pages, me);
		});
	}
}
