/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';

import * as OTPAuth from 'otpauth';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	requireCredential: true,

	secure: true,

	res: {
		type: 'object',
		properties: {
			backupCodes: {
				type: 'array',
				optional: false,
				items: {
					type: 'string',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		token: { type: 'string' },
	},
	required: ['token'],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@inject(delay(() => UserEntityService))
		private userEntityService: UserEntityService,

		@inject(delay(() => GlobalEventService))
		private globalEventService: GlobalEventService) {
		super(meta, paramDef, async (ps, me) => {
			const token = ps.token.replace(/\s/g, '');

			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			if (profile.twoFactorTempSecret == null) {
				throw new Error('二段階認証の設定が開始されていません');
			}

			const delta = OTPAuth.TOTP.validate({
				secret: OTPAuth.Secret.fromBase32(profile.twoFactorTempSecret),
				digits: 6,
				token,
				window: 5,
			});

			if (delta === null) {
				throw new Error('not verified');
			}

			const backupCodes = Array.from({ length: 5 }, () => new OTPAuth.Secret().base32);

			await this.userProfilesRepository.update(me.id, {
				twoFactorSecret: profile.twoFactorTempSecret,
				twoFactorBackupSecret: backupCodes,
				twoFactorEnabled: true,
			});

			// Publish meUpdated event
			this.globalEventService.publishMainStream(me.id, 'meUpdated', await this.userEntityService.pack(me.id, me, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}));

			return {
				backupCodes: backupCodes,
			};
		});
	}
}
