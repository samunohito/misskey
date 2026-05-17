/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, injectable } from 'tsyringe';
import { ConfigToken } from './tokens.js';

interface Config {
	name: string;
}

@injectable()
export class LeafService {
	constructor(@inject(ConfigToken) public config: Config) {}

	greet(): string {
		return `Hello from LeafService with config=${this.config.name}`;
	}
}
