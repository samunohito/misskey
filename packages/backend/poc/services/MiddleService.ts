/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { injectable } from 'tsyringe';
import { LeafService } from './LeafService.js';

@injectable()
export class MiddleService {
	constructor(public leaf: LeafService) {}

	echo(): string {
		return `MiddleService -> ${this.leaf.greet()}`;
	}
}
