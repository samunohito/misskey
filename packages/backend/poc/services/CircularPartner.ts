/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import * as RootServiceMod from './RootService.js';
import type { RootService } from './RootService.js';

@injectable()
export class CircularPartner {
	constructor(
		@inject(delay(() => RootServiceMod.RootService)) public root: RootService,
	) {}

	id(): string {
		return 'CircularPartner-OK';
	}
}
