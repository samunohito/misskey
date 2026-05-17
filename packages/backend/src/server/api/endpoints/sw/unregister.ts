/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import type { SwSubscriptionsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';

export const meta = {
	tags: ['account'],

	requireCredential: false,

	description: 'Unregister from receiving push notifications.',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		endpoint: { type: 'string' },
	},
	required: ['endpoint'],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(DI.swSubscriptionsRepository)
		private swSubscriptionsRepository: SwSubscriptionsRepository, @inject(delay(() => PushNotificationService)) private pushNotificationService: PushNotificationService) {
		super(meta, paramDef, async (ps, me) => {
			await this.swSubscriptionsRepository.delete({
				...(me ? { userId: me.id } : {}),
				endpoint: ps.endpoint,
			});

			if (me) {
				this.pushNotificationService.refreshCache(me.id);
			}
		});
	}
}
