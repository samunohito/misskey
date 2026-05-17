/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import Chart from '../core.js';
import { ChartLoggerService } from '../ChartLoggerService.js';
import { name, schema } from './entities/ap-request.js';
import type { KVs } from '../core.js';

/**
 * Chart about ActivityPub requests
 */
@injectable()
export default class ApRequestChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.db)
		private db: DataSource,

		@inject(DI.redis)
		private redisClient: Redis.Redis,@inject(delay(() => ChartLoggerService)) private chartLoggerService: ChartLoggerService) {
		super(db, (k) => acquireChartInsertLock(redisClient, k), chartLoggerService.logger, name, schema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public async deliverSucc(): Promise<void> {
		await this.commit({
			'deliverSucceeded': 1,
		});
	}

	@bindThis
	public async deliverFail(): Promise<void> {
		await this.commit({
			'deliverFailed': 1,
		});
	}

	@bindThis
	public async inbox(): Promise<void> {
		await this.commit({
			'inboxReceived': 1,
		});
	}
}
