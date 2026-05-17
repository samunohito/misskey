/*
 * SPDX-FileCopyrightText: syuilo and misskey-project , Type4ny-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { In } from 'typeorm';
import type { RenoteMutingsRepository } from '@/models/_.js';
import type { MiRenoteMuting } from '@/models/RenoteMuting.js';

import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';

@injectable()
export class UserRenoteMutingService {
	constructor(
		@inject(DI.renoteMutingsRepository)
		private renoteMutingsRepository: RenoteMutingsRepository,@inject(delay(() => IdService)) private idService: IdService,@inject(delay(() => CacheService)) private cacheService: CacheService) {
	}

	@bindThis
	public async mute(user: MiUser, target: MiUser, expiresAt: Date | null = null): Promise<void> {
		await this.renoteMutingsRepository.insert({
			id: this.idService.gen(),
			muterId: user.id,
			muteeId: target.id,
		});

		await this.cacheService.renoteMutingsCache.refresh(user.id);
	}

	@bindThis
	public async unmute(mutings: MiRenoteMuting[]): Promise<void> {
		if (mutings.length === 0) return;

		await this.renoteMutingsRepository.delete({
			id: In(mutings.map(m => m.id)),
		});

		const muterIds = [...new Set(mutings.map(m => m.muterId))];
		for (const muterId of muterIds) {
			await this.cacheService.renoteMutingsCache.refresh(muterId);
		}
	}
}
