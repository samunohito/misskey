/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { NoteDraftsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['notes', 'drafts'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'read:account',

	res: {
		type: 'number',
		optional: false, nullable: false,
		description: 'The number of drafts',
	},

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.noteDraftsRepository)
		private noteDraftsRepository: NoteDraftsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const count = await this.noteDraftsRepository.createQueryBuilder('drafts')
				.where('drafts.userId = :meId', { meId: me.id })
				.getCount();

			return count;
		});
	}
}
