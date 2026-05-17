/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import type Logger from '@/logger.js';
import { RemoteLoggerService } from '@/core/RemoteLoggerService.js';

@injectable()
export class ApLoggerService {
	public logger: Logger;

	constructor(
		@inject(delay(() => RemoteLoggerService))
		private remoteLoggerService: RemoteLoggerService,
	) {
		this.logger = this.remoteLoggerService.logger.createSubLogger('ap', 'magenta');
	}
}
