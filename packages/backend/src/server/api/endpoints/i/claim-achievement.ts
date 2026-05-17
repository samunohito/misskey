/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AchievementService } from '@/core/AchievementService.js';
import { ACHIEVEMENT_TYPES } from '@/models/UserProfile.js';

export const meta = {
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:account',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', enum: ACHIEVEMENT_TYPES },
	},
	required: ['name'],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(@inject(delay(() => AchievementService)) private achievementService: AchievementService) {
		super(meta, paramDef, async (ps, me) => {
			await this.achievementService.create(me.id, ps.name);
		});
	}
}
