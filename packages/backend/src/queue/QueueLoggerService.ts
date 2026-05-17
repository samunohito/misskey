/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

@injectable()
export class QueueLoggerService {
	public logger: Logger;

	constructor(
		@inject(delay(() => LoggerService))
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('queue', 'orange');
	}
}
