/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DriveFilesRepository, ChatMessagesRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ChatService } from '@/core/ChatService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['drive', 'chat'],

	requireCredential: true,

	kind: 'read:drive',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'ChatMessage',
		},
	},

	errors: {
		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '485ce26d-f5d2-4313-9783-e689d131eafb',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		fileId: { type: 'string', format: 'misskey:id' },
	},
	required: ['fileId'],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@inject(delay(() => ChatService))
		private chatService: ChatService,

		@inject(delay(() => ChatEntityService))
		private chatEntityService: ChatEntityService,

		@inject(delay(() => QueryService))
		private queryService: QueryService,

		@inject(delay(() => RoleService))
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const isModerator = await this.roleService.isModerator(me);

			if (!isModerator) {
				await this.chatService.checkChatAvailability(me.id, 'read');
			}

			const file = await this.driveFilesRepository.findOneBy({
				id: ps.fileId,
				userId: isModerator ? undefined : me.id,
			});

			if (file == null) {
				throw new ApiError(meta.errors.noSuchFile);
			}

			const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate);
			query.andWhere('message.fileId = :fileId', { fileId: file.id });

			const messages = await query.limit(ps.limit).getMany();

			return await this.chatEntityService.packMessagesDetailed(messages, me);
		});
	}
}
