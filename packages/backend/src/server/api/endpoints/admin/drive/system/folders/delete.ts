/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
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
			id: '1069098f-c281-440f-b085-f9932edbe091',
		},

		hasChildFilesOrFolders: {
			message: 'This folder has child files or folders.',
			code: 'HAS_CHILD_FILES_OR_FOLDERS',
			id: 'b0fc8a17-963c-405d-bfbc-859a487295e1',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		folderId: { type: 'string', format: 'misskey:id' },
	},
	required: ['folderId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveFolderService: DriveFolderService,
	) {
		super(meta, paramDef, async (ps) => {
			try {
				await this.driveFolderService.delete({ id: ps.folderId, userId: null });
			} catch (e) {
				switch (true) {
					case e instanceof DriveFolderService.NoSuchFolderError:
						throw new ApiError(meta.errors.noSuchFolder);
					case e instanceof DriveFolderService.HasChildFilesOrFoldersError:
						throw new ApiError(meta.errors.hasChildFilesOrFolders);
					default:
						throw e;
				}
			}
		});
	}
}
