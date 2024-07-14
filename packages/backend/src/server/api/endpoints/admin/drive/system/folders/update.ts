/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFolderService } from '@/core/DriveFolderService.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin', 'drive', 'system', 'folders'],

	requireCredential: true,
	requireModerator: true,

	kind: 'write:admin:drive',

	errors: {
		noSuchFolder: {
			message: 'No such folder.',
			code: 'NO_SUCH_FOLDER',
			id: 'f7974dac-2c0d-4a27-926e-23583b28e98e',
		},

		noSuchParentFolder: {
			message: 'No such parent folder.',
			code: 'NO_SUCH_PARENT_FOLDER',
			id: 'ce104e3a-faaf-49d5-b459-10ff0cbbcaa1',
		},

		recursiveNesting: {
			message: 'It can not be structured like nesting folders recursively.',
			code: 'RECURSIVE_NESTING',
			id: 'dbeb024837894013aed44279f9199740',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'DriveFolder',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		folderId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', maxLength: 200 },
		parentId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['folderId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveFolderService: DriveFolderService,
		private driveFolderEntityService: DriveFolderEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			try {
				const folder = await this.driveFolderService.update(
					{
						id: ps.folderId,
						userId: null,
					},
					{
						name: ps.name,
						parentId: ps.parentId,
					},
				);

				return this.driveFolderEntityService.pack(folder);
			} catch (e) {
				switch (true) {
					case e instanceof DriveFolderService.NoSuchFolderError:
						throw new ApiError(meta.errors.noSuchFolder);
					case e instanceof DriveFolderService.NoSuchParentFolderError:
						throw new ApiError(meta.errors.noSuchParentFolder);
					case e instanceof DriveFolderService.RecursiveNestingError:
						throw new ApiError(meta.errors.recursiveNesting);
					default:
						throw e;
				}
			}
		});
	}
}
