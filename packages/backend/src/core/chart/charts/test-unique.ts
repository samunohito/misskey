/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import Chart from '../core.js';
import { name, schema } from './entities/test-unique.js';
import type { KVs } from '../core.js';

/**
 * For testing
 */
@injectable()
export default class TestUniqueChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.db)
		private db: DataSource,

		@inject(DI.redis)
		private redisClient: Redis.Redis,

		@inject(delay(() => Logger))
		logger: Logger) {
		super(db, (k) => acquireChartInsertLock(redisClient, k), logger, name, schema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public async uniqueIncrement(key: string): Promise<void> {
		await this.commit({
			foo: [key],
		});
	}
}
