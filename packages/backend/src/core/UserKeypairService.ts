/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Disposable, DisposableRegistry } from '@/di/disposable-registry.js';
import * as Redis from 'ioredis';
import type { MiUser } from '@/models/User.js';
import type { UserKeypairsRepository } from '@/models/_.js';
import { RedisKVCache } from '@/misc/cache.js';
import type { MiUserKeypair } from '@/models/UserKeypair.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';

@injectable()
export class UserKeypairService implements Disposable {
	private cache: RedisKVCache<MiUserKeypair>;

	constructor(
		@inject(DI.redis)
		private redisClient: Redis.Redis,

		@inject(DI.userKeypairsRepository)
		private userKeypairsRepository: UserKeypairsRepository, @inject(delay(() => DisposableRegistry)) registry: DisposableRegistry) {
		registry.register(this);
		this.cache = new RedisKVCache<MiUserKeypair>(this.redisClient, 'userKeypair', {
			lifetime: 1000 * 60 * 60 * 24, // 24h
			memoryCacheLifetime: 1000 * 60 * 60, // 1h
			fetcher: (key) => this.userKeypairsRepository.findOneByOrFail({ userId: key }),
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
		});
	}

	@bindThis
	public async getUserKeypair(userId: MiUser['id']): Promise<MiUserKeypair> {
		return await this.cache.fetch(userId);
	}

	@bindThis
	public dispose(): void {
		this.cache.dispose();
	}
}
