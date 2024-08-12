/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';
import { DriveFolderService } from '@/core/DriveFolderService.js';

export const meta = {
	tags: ['admin', 'drive', 'system', 'folders'],

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
					ref: 'DriveFolder',
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
				parentId: { type: 'string', format: 'misskey:id', nullable: true },
			},
		},
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		page: { type: 'integer' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveFolderService: DriveFolderService,
		private driveFolderEntityService: DriveFolderEntityService,
	) {
		super(meta, paramDef, async (ps) => {
			const folders = await this.driveFolderService.search(
				{
					sinceId: ps.sinceId,
					untilId: ps.untilId,
					userIds: [null],
					names: ps.query?.name ? ps.query.name.split(/\s/) : undefined,
					parentIds: ps.query?.parentId ? [ps.query.parentId] : undefined,
				},
				{
					limit: ps.limit,
					page: ps.page,
				},
			);
			return {
				items: await Promise.all(folders.items.map(folder => this.driveFolderEntityService.pack(folder))),
				count: folders.count,
				allCount: folders.allCount,
				allPages: folders.allPages,
			};
		});
	}
}
