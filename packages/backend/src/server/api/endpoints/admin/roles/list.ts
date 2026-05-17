/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { RolesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { RoleEntityService } from '@/core/entities/RoleEntityService.js';

export const meta = {
	tags: ['admin', 'role'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:roles',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Role',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [
	],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,@inject(delay(() => RoleEntityService)) private roleEntityService: RoleEntityService) {
		super(meta, paramDef, async (ps, me) => {
			const roles = await this.rolesRepository.find({
				order: { lastUsedAt: 'DESC' },
			});
			return await this.roleEntityService.packMany(roles, me);
		});
	}
}
