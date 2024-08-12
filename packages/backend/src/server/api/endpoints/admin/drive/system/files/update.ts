/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { DriveFilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { DriveService } from '@/core/DriveService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin', 'drive', 'system', 'files'],

	requireCredential: true,
	requireModerator: true,

	kind: 'write:admin:drive',

	description: 'Update the properties of a drive file.',

	errors: {
		invalidFileName: {
			message: 'Invalid file name.',
			code: 'INVALID_FILE_NAME',
			id: '395e7156-f9f0-475e-af89-53c3c23080c2',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'e7778c7e-3af9-49cd-9690-6dbc3e6c972d',
		},

		noSuchFolder: {
			message: 'No such folder.',
			code: 'NO_SUCH_FOLDER',
			id: 'ea8fb7a5-af77-4a08-b608-c0218176cd73',
		},
	},
	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'DriveFile',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true },
		name: { type: 'string' },
		isSensitive: { type: 'boolean' },
		comment: { type: 'string', nullable: true, maxLength: 512 },
	},
	required: ['fileId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,
		private driveService: DriveService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const file = await this.driveFilesRepository.findOneBy({ id: ps.fileId });
			if (file == null) {
				throw new ApiError(meta.errors.noSuchFile);
			}

			try {
				return await this.driveService.updateFile(
					file,
					{
						folderId: ps.folderId,
						name: ps.name,
						isSensitive: ps.isSensitive,
						comment: ps.comment,
					},
					me,
				);
			} catch (e) {
				if (e instanceof DriveService.InvalidFileNameError) {
					throw new ApiError(meta.errors.invalidFileName);
				} else if (e instanceof DriveService.NoSuchFolderError) {
					throw new ApiError(meta.errors.noSuchFolder);
				} else {
					throw e;
				}
			}
		});
	}
}
