/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import { DI } from '@/di-symbols.js';
import type { NotesRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import Chart from '../core.js';
import { ChartLoggerService } from '../ChartLoggerService.js';
import { name, schema } from './entities/per-user-notes.js';
import type { KVs } from '../core.js';

/**
 * ユーザーごとのノートに関するチャート
 */
@injectable()
export default class PerUserNotesChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.db)
		private db: DataSource,

		@inject(DI.redis)
		private redisClient: Redis.Redis,

		@inject(DI.notesRepository)
		private notesRepository: NotesRepository,@inject(delay(() => ChartLoggerService)) private chartLoggerService: ChartLoggerService) {
		super(db, (k) => acquireChartInsertLock(redisClient, k), chartLoggerService.logger, name, schema, true);
	}

	protected async tickMajor(group: string): Promise<Partial<KVs<typeof schema>>> {
		const [count] = await Promise.all([
			this.notesRepository.countBy({ userId: group }),
		]);

		return {
			total: count,
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public update(user: { id: MiUser['id'] }, note: MiNote, isAdditional: boolean): void {
		this.commit({
			'total': isAdditional ? 1 : -1,
			'inc': isAdditional ? 1 : 0,
			'dec': isAdditional ? 0 : 1,
			'diffs.normal': note.replyId == null && note.renoteId == null ? (isAdditional ? 1 : -1) : 0,
			'diffs.renote': note.renoteId != null ? (isAdditional ? 1 : -1) : 0,
			'diffs.reply': note.replyId != null ? (isAdditional ? 1 : -1) : 0,
			'diffs.withFile': note.fileIds.length > 0 ? (isAdditional ? 1 : -1) : 0,
		}, user.id);
	}
}
