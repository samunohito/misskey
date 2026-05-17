/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DbQueue, DeliverQueue, EndedPollNotificationQueue, PostScheduledNoteQueue, InboxQueue, ObjectStorageQueue, SystemQueue, UserWebhookDeliverQueue, SystemWebhookDeliverQueue } from '@/queue/queue-types.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:emoji',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			deliver: {
				optional: false, nullable: false,
				ref: 'QueueCount',
			},
			inbox: {
				optional: false, nullable: false,
				ref: 'QueueCount',
			},
			db: {
				optional: false, nullable: false,
				ref: 'QueueCount',
			},
			objectStorage: {
				optional: false, nullable: false,
				ref: 'QueueCount',
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject('queue:system') public systemQueue: SystemQueue,
		@inject('queue:endedPollNotification') public endedPollNotificationQueue: EndedPollNotificationQueue,
		@inject('queue:postScheduledNote') public postScheduledNoteQueue: PostScheduledNoteQueue,
		@inject('queue:deliver') public deliverQueue: DeliverQueue,
		@inject('queue:inbox') public inboxQueue: InboxQueue,
		@inject('queue:db') public dbQueue: DbQueue,
		@inject('queue:objectStorage') public objectStorageQueue: ObjectStorageQueue,
		@inject('queue:userWebhookDeliver') public userWebhookDeliverQueue: UserWebhookDeliverQueue,
		@inject('queue:systemWebhookDeliver') public systemWebhookDeliverQueue: SystemWebhookDeliverQueue,
	) {
		super(meta, paramDef, async (ps, me) => {
			const deliverJobCounts = await this.deliverQueue.getJobCounts();
			const inboxJobCounts = await this.inboxQueue.getJobCounts();
			const dbJobCounts = await this.dbQueue.getJobCounts();
			const objectStorageJobCounts = await this.objectStorageQueue.getJobCounts();

			return {
				deliver: deliverJobCounts,
				inbox: inboxJobCounts,
				db: dbJobCounts,
				objectStorage: objectStorageJobCounts,
			};
		});
	}
}
