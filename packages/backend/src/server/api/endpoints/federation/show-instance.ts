/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { InstancesRepository } from '@/models/_.js';
import { InstanceEntityService } from '@/core/entities/InstanceEntityService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: true,
		ref: 'FederationInstance',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
	},
	required: ['host'],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,@inject(delay(() => UtilityService)) private utilityService: UtilityService,@inject(delay(() => InstanceEntityService)) private instanceEntityService: InstanceEntityService) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.instancesRepository
				.findOneBy({ host: this.utilityService.toPuny(ps.host) });

			return instance ? await this.instanceEntityService.pack(instance, me) : null;
		});
	}
}
