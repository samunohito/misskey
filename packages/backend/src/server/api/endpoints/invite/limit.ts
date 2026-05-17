/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { MoreThan } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { RegistrationTicketsRepository } from '@/models/_.js';
import { RoleService } from '@/core/RoleService.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';

export const meta = {
	tags: ['meta'],

	requireCredential: true,
	requiredRolePolicy: 'canInvite',
	kind: 'read:invite-codes',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			remaining: {
				type: 'integer',
				optional: false, nullable: true,
			},
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
		@inject(DI.registrationTicketsRepository)
		private registrationTicketsRepository: RegistrationTicketsRepository, @inject(delay(() => RoleService)) private roleService: RoleService, @inject(delay(() => IdService)) private idService: IdService) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me.id);

			const count = policies.inviteLimit ? await this.registrationTicketsRepository.countBy({
				id: MoreThan(this.idService.gen(Date.now() - (policies.inviteLimitCycle * 60 * 1000))),
				createdById: me.id,
			}) : null;

			return {
				remaining: count !== null ? Math.max(0, policies.inviteLimit - count) : null,
			};
		});
	}
}
