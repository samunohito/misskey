/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Not, IsNull, DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { UsersRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import Chart from '../core.js';
import { ChartLoggerService } from '../ChartLoggerService.js';
import { name, schema } from './entities/users.js';
import type { KVs } from '../core.js';

/**
 * ユーザー数に関するチャート
 */
@injectable()
export default class UsersChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.db)
		private db: DataSource,

		@inject(DI.redis)
		private redisClient: Redis.Redis,

		@inject(DI.usersRepository)
		private usersRepository: UsersRepository,@inject(delay(() => UserEntityService)) private userEntityService: UserEntityService,@inject(delay(() => ChartLoggerService)) private chartLoggerService: ChartLoggerService) {
		super(db, (k) => acquireChartInsertLock(redisClient, k), chartLoggerService.logger, name, schema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> {
		const [localCount, remoteCount] = await Promise.all([
			this.usersRepository.countBy({ host: IsNull() }),
			this.usersRepository.countBy({ host: Not(IsNull()) }),
		]);

		return {
			'local.total': localCount,
			'remote.total': remoteCount,
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public async update(user: { id: MiUser['id'], host: MiUser['host'] }, isAdditional: boolean): Promise<void> {
		const prefix = this.userEntityService.isLocalUser(user) ? 'local' : 'remote';

		await this.commit({
			[`${prefix}.total`]: isAdditional ? 1 : -1,
			[`${prefix}.inc`]: isAdditional ? 1 : 0,
			[`${prefix}.dec`]: isAdditional ? 0 : 1,
		});
	}
}
