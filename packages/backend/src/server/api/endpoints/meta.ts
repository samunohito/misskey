/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaEntityService } from '@/core/entities/MetaEntityService.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	res: {
		type: 'object',
		oneOf: [
			{ type: 'object', ref: 'MetaLite' },
			{ type: 'object', ref: 'MetaDetailed' },
		],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		detail: { type: 'boolean', default: true },
	},
	required: [],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(@inject(delay(() => MetaEntityService)) private metaEntityService: MetaEntityService) {
		super(meta, paramDef, async (ps, me) => {
			return ps.detail ? await this.metaEntityService.packDetailed() : await this.metaEntityService.pack();
		});
	}
}
