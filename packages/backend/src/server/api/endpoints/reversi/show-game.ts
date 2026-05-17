/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ReversiService } from '@/core/ReversiService.js';
import { ReversiGameEntityService } from '@/core/entities/ReversiGameEntityService.js';
import { ApiError } from '../../error.js';

export const meta = {
	requireCredential: false,

	errors: {
		noSuchGame: {
			message: 'No such game.',
			code: 'NO_SUCH_GAME',
			id: 'f13a03db-fae1-46c9-87f3-43c8165419e1',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ReversiGameDetailed',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		gameId: { type: 'string', format: 'misskey:id' },
	},
	required: ['gameId'],
} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(@inject(delay(() => ReversiService)) private reversiService: ReversiService, @inject(delay(() => ReversiGameEntityService)) private reversiGameEntityService: ReversiGameEntityService) {
		super(meta, paramDef, async (ps, me) => {
			const game = await this.reversiService.get(ps.gameId);

			if (game == null) {
				throw new ApiError(meta.errors.noSuchGame);
			}

			return await this.reversiGameEntityService.packDetail(game);
		});
	}
}
