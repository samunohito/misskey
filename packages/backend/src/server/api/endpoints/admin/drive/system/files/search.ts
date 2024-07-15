/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { driveFileSearchSortKeys, DriveService } from '@/core/DriveService.js';

export const meta = {
	tags: ['admin', 'drive', 'system', 'files'],

	requireCredential: true,
	requireModerator: true,

	kind: 'read:admin:drive',

	res: {
		type: 'object',
		properties: {
			items: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'DriveFile',
				},
			},
			count: { type: 'integer' },
			allCount: { type: 'integer' },
			allPages: { type: 'integer' },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: {
			type: 'object',
			nullable: true,
			properties: {
				name: { type: 'string' },
				folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
				type: { type: 'string', nullable: true, pattern: /^[a-zA-Z\/\-*]+$/.toString().slice(1, -1) },
			},
		},
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		page: { type: 'integer' },
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
		super(meta, paramDef, async (ps) => {
			const result = await this.driveService.search(
				{
					sinceId: ps.sinceId,
					untilId: ps.untilId,
					names: ps.query?.name ? ps.query.name.split(/\s/) : undefined,
					folderIds: ps.query?.folderId ? [ps.query.folderId] : undefined,
					userIds: [null],
					fileTypes: ps.query?.type ? [ps.query.type] : undefined,
				},
				{
					limit: ps.limit,
					page: ps.page,
					sortKeys: ps.sort ? [ps.sort] : undefined,
				},
			);

			return {
				items: await this.driveFileEntityService.packMany(result.items, { detail: false, self: true }),
				count: result.count,
				allCount: result.allCount,
				allPages: result.allPages,
			};
		});
	}
}
