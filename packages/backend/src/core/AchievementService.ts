/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import type { UserProfilesRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { NotificationService } from '@/core/NotificationService.js';
import { ACHIEVEMENT_TYPES } from '@/models/UserProfile.js';

@injectable()
export class AchievementService {
	constructor(
		@inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@inject(delay(() => NotificationService))
		private notificationService: NotificationService) {
	}

	@bindThis
	public async create(
		userId: MiUser['id'],
		type: typeof ACHIEVEMENT_TYPES[number],
	): Promise<void> {
		if (!ACHIEVEMENT_TYPES.includes(type)) return;

		const date = Date.now();

		const profile = await this.userProfilesRepository.findOneByOrFail({ userId: userId });

		if (profile.achievements.some(a => a.name === type)) return;

		await this.userProfilesRepository.update(userId, {
			achievements: [...profile.achievements, {
				name: type,
				unlockedAt: date,
			}],
		});

		this.notificationService.createNotification(userId, 'achievementEarned', {
			achievement: type,
		});
	}
}
