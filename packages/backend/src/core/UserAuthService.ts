/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, injectable } from 'tsyringe';
import { QueryFailedError } from 'typeorm';
import * as OTPAuth from 'otpauth';
import { DI } from '@/di-symbols.js';
import type { MiUserProfile, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import type { MiLocalUser } from '@/models/User.js';

@injectable()
export class UserAuthService {
	constructor(
		@inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
	) {
	}

	@bindThis
	public async twoFactorAuthenticate(profile: MiUserProfile, token: string): Promise<void> {
		if (profile.twoFactorBackupSecret?.includes(token)) {
			await this.userProfilesRepository.update({ userId: profile.userId }, {
				twoFactorBackupSecret: profile.twoFactorBackupSecret.filter((secret) => secret !== token),
			});
		} else {
			const delta = OTPAuth.TOTP.validate({
				secret: OTPAuth.Secret.fromBase32(profile.twoFactorSecret!),
				digits: 6,
				token,
				window: 5,
			});

			if (delta === null) {
				throw new Error('authentication failed');
			}
		}
	}
}
