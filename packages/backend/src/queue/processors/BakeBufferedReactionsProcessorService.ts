/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

@injectable()
export class BakeBufferedReactionsProcessorService {
	private logger: Logger;

	constructor(
		@inject(DI.meta)
		private meta: MiMeta,@inject(delay(() => ReactionsBufferingService)) private reactionsBufferingService: ReactionsBufferingService,@inject(delay(() => QueueLoggerService)) private queueLoggerService: QueueLoggerService) {
		this.logger = this.queueLoggerService.logger.createSubLogger('bake-buffered-reactions');
	}

	@bindThis
	public async process(): Promise<void> {
		if (!this.meta.enableReactionsBuffering) {
			this.logger.info('Reactions buffering is disabled. Skipping...');
			return;
		}

		this.logger.info('Baking buffered reactions...');

		await this.reactionsBufferingService.bake();

		this.logger.succ('All buffered reactions baked.');
	}
}
