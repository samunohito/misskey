/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, injectable } from 'tsyringe';
import { RequestToken } from '@/di/container.js';
import { bindThis } from '@/decorators.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';
@injectable()
export class AdminChannel extends Channel {
	public readonly chName = 'admin';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:admin:stream';

	constructor(
		@inject(RequestToken)
		request: ChannelRequest,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject) {
		// Subscribe admin stream
		this.subscriber.on(`adminStream:${this.user!.id}`, data => {
			this.send(data);
		});
	}
}
