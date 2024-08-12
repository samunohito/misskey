/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFolderService } from '@/core/DriveFolderService.js';
import { ApiError } from '@/server/api/error.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';

export const meta = {
	tags: ['admin', 'drive', 'system'],

	requireCredential: true,
	requireModerator: true,

	kind: 'read:admin:drive',

	res: {
		type: 'object',
		properties: {
			hierarchies: {
				type: 'array',
				items: {
					type: 'object',
					ref: 'DriveFolder',
				},
			},
		},
	},

	errors: {
		noSuchParentFolder: {
			message: 'No such parent folder.',
			code: 'NO_SUCH_PARENT_FOLDER',
			id: 'ce104e3a-faaf-49d5-b459-10ff0cbbcaa1',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		currentFolderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
	},
	required: ['currentFolderId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveFolderService: DriveFolderService,
		private driveFolderEntityService: DriveFolderEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			try {
				const hierarchies = await this.driveFolderService.pwd({
					userId: null,
					currentFolderId: ps.currentFolderId,
				});

				return {
					hierarchies: await Promise.all(hierarchies.map(folder => this.driveFolderEntityService.pack(folder))),
				};
			} catch (e) {
				switch (true) {
					case e instanceof DriveFolderService.NoSuchParentFolderError:
						throw new ApiError(meta.errors.noSuchParentFolder);
					default:
						throw new ApiError();
				}
			}
		});
	}
}
