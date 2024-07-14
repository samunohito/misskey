/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';
import { ApiError } from '@/server/api/error.js';
import { DriveFolderService } from '@/core/DriveFolderService.js';

export const meta = {
	tags: ['admin', 'drive', 'system', 'folders'],

	requireCredential: true,
	requireModerator: true,

	kind: 'write:admin:drive',

	errors: {
		noSuchFolder: {
			message: 'No such folder.',
			code: 'NO_SUCH_FOLDER',
			id: '53326628-a00d-40a6-a3cd-8975105c0f95',
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
		name: { type: 'string', default: 'Untitled', maxLength: 200 },
		parentId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveFolderService: DriveFolderService,
		private driveFolderEntityService: DriveFolderEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			try {
				const folder = await this.driveFolderService.create({
					userId: null,
					name: ps.name,
					parentId: ps.parentId,
				});

				return this.driveFolderEntityService.pack(folder);
			} catch (e) {
				switch (true) {
					case e instanceof DriveFolderService.NoSuchFolderError:
						throw new ApiError(meta.errors.noSuchFolder);
					default:
						throw e;
				}
			}
		});
	}
}
