/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { GetterService } from '@/server/api/GetterService.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(@inject(delay(() => GetterService)) private getterService: GetterService,@inject(delay(() => ApPersonService)) private apPersonService: ApPersonService) {
		super(meta, paramDef, async (ps) => {
			const user = await this.getterService.getRemoteUser(ps.userId);
			await this.apPersonService.updatePerson(user.uri!);
		});
	}
}
