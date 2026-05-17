/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { DI } from '@/di-symbols.js';
import type { MutingsRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { UserMutingService } from '@/core/UserMutingService.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

@injectable()
export class CheckExpiredMutingsProcessorService {
	private logger: Logger;

	constructor(
		@inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@inject(delay(() => UserMutingService))
		private userMutingService: UserMutingService,

		@inject(delay(() => ChannelMutingService))
		private channelMutingService: ChannelMutingService,

		@inject(delay(() => QueueLoggerService))
		private queueLoggerService: QueueLoggerService) {
		this.logger = this.queueLoggerService.logger.createSubLogger('check-expired-mutings');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Checking expired mutings...');

		const expired = await this.mutingsRepository.createQueryBuilder('muting')
			.where('muting.expiresAt IS NOT NULL')
			.andWhere('muting.expiresAt < :now', { now: new Date() })
			.innerJoinAndSelect('muting.mutee', 'mutee')
			.getMany();

		if (expired.length > 0) {
			await this.userMutingService.unmute(expired);
		}

		await this.channelMutingService.eraseExpiredMutings();

		this.logger.succ('All expired mutings checked.');
	}
}
