/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import {
	AbuseReportNotificationRecipientEntityService,
} from '@/core/entities/AbuseReportNotificationRecipientEntityService.js';
import { AbuseReportNotificationService } from '@/core/AbuseReportNotificationService.js';

export const meta = {
	tags: ['admin', 'abuse-report', 'notification-recipient'],

	requireCredential: true,
	requireModerator: true,
	secure: true,
	kind: 'read:admin:abuse-report:notification-recipient',

	res: {
		type: 'array',
		items: {
			type: 'object',
			ref: 'AbuseReportNotificationRecipient',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		method: {
			type: 'array',
			items: {
				type: 'string',
				enum: ['email', 'webhook'],
			},
		},
	},
	required: [],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(delay(() => AbuseReportNotificationService))
		private abuseReportNotificationService: AbuseReportNotificationService,

		@inject(delay(() => AbuseReportNotificationRecipientEntityService))
		private abuseReportNotificationRecipientEntityService: AbuseReportNotificationRecipientEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			const recipients = await this.abuseReportNotificationService.fetchRecipients({ method: ps.method });
			return this.abuseReportNotificationRecipientEntityService.packMany(recipients);
		});
	}
}
