/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { injectable } from 'tsyringe';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

@injectable()
export class ClientLoggerService {
	public logger: Logger;

	constructor(
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('client');
	}
}
