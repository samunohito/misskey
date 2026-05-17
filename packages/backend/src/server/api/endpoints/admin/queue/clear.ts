/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { QUEUE_TYPES, QueueService } from '@/core/QueueService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:queue',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		queue: { type: 'string', enum: QUEUE_TYPES },
		state: { type: 'string', enum: ['*', 'completed', 'wait', 'active', 'paused', 'prioritized', 'delayed', 'failed'] },
	},
	required: ['queue', 'state'],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(delay(() => ModerationLogService))
		private moderationLogService: ModerationLogService,

		@inject(delay(() => QueueService))
		private queueService: QueueService) {
		super(meta, paramDef, async (ps, me) => {
			this.queueService.queueClear(ps.queue, ps.state);

			this.moderationLogService.log(me, 'clearQueue');
		});
	}
}
