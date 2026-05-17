/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { ObjectStorageFileJobData } from '../types.js';

@injectable()
export class DeleteFileProcessorService {
	private logger: Logger;

	constructor(
		@inject(delay(() => DriveService))
		private driveService: DriveService,

		@inject(delay(() => QueueLoggerService))
		private queueLoggerService: QueueLoggerService) {
		this.logger = this.queueLoggerService.logger.createSubLogger('delete-file');
	}

	@bindThis
	public async process(job: Bull.Job<ObjectStorageFileJobData>): Promise<string> {
		const key: string = job.data.key;

		await this.driveService.deleteObjectStorageFile(key);

		return 'Success';
	}
}
