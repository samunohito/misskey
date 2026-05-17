/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { MiddleService } from './MiddleService.js';
import { CircularPartner } from './CircularPartner.js';
import type { CircularPartner as CircularPartnerType } from './CircularPartner.js';

@injectable()
export class RootService {
	constructor(
		public middle: MiddleService,
		@inject(delay(() => CircularPartner)) public partner: CircularPartnerType,
	) {}

	run(): string {
		return `RootService -> ${this.middle.echo()} | partner.id=${this.partner.id()}`;
	}
}
