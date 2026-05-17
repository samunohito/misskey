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
export class DriveChannel extends Channel {
	public readonly chName = 'drive';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:account';

	constructor(
		@inject(RequestToken)
		request: ChannelRequest,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject) {
		// Subscribe drive stream
		this.subscriber.on(`driveStream:${this.user!.id}`, data => {
			this.send(data);
		});
	}
}
