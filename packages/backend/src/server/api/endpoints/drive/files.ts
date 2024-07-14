/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { driveFileSearchSortKeys, DriveService } from '@/core/DriveService.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'read:drive',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'DriveFile',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		type: { type: 'string', nullable: true, pattern: /^[a-zA-Z\/\-*]+$/.toString().slice(1, -1) },
		sort: {
			type: 'string',
			nullable: true,
			enum: driveFileSearchSortKeys,
		},
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveService: DriveService,
		private driveFileEntityService: DriveFileEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const files = await this.driveService.search(
				{
					sinceId: ps.sinceId,
					untilId: ps.untilId,
					folderIds: ps.folderId ? [ps.folderId] : undefined,
					userIds: [me.id],
					fileTypes: ps.type ? [ps.type] : undefined,
				},
				{
					limit: ps.limit,
					sortKeys: ps.sort ? [ps.sort] : undefined,
				},
			);
			return await this.driveFileEntityService.packMany(files, { detail: false, self: true });
		});
	}
}
