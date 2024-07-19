/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DriveFolderService } from '@/core/DriveFolderService.js';
import { exploreKinds } from '@/models/DriveExploreView.js';
import { ApiError } from '@/server/api/error.js';
import { IdService } from '@/core/IdService.js';

export const meta = {
	tags: ['admin', 'drive', 'system'],

	requireCredential: true,
	requireModerator: true,

	kind: 'read:admin:drive',

	res: {
		type: 'object',
		properties: {
			items: {
				type: 'array',
				items: {
					type: 'object',
					ref: 'DriveExploreItem',
				},
			},
			count: { type: 'integer' },
			allCount: { type: 'integer' },
			allPages: { type: 'integer' },
		},
	},

	errors: {
		noSuchFolder: {
			message: 'No such folder.',
			code: 'NO_SUCH_FOLDER',
			id: '1069098f-c281-440f-b085-f9932edbe091',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		currentFolderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		query: {
			type: 'object',
			properties: {
				name: { type: 'string' },
				fileType: { type: 'string', nullable: true, pattern: /^[a-zA-Z\/\-*]+$/.toString().slice(1, -1) },
				comment: { type: 'string' },
				isSensitive: { type: 'boolean' },
				isLink: { type: 'boolean' },
				sizeMin: { type: 'integer' },
				sizeMax: { type: 'integer' },
				kinds: {
					type: 'array',
					items: {
						type: 'string',
						enum: [...exploreKinds, 'all'],
					},
				},
			},
			required: [],
		},
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		page: { type: 'integer' },
	},
	required: ['currentFolderId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private driveFolderService: DriveFolderService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const folders = await this.driveFolderService.explore(
					{
						userId: me.id,
						currentFolderId: ps.currentFolderId,
						query: {
							names: ps.query?.name ? ps.query.name.split(/\s/) : undefined,
							fileTypes: ps.query?.fileType ? ps.query.fileType.split(/\s/) : undefined,
							commentWords: ps.query?.comment ? ps.query.comment.split(/\s/) : undefined,
							isSensitive: ps.query?.isSensitive,
							isLink: ps.query?.isLink,
							sizeMin: ps.query?.sizeMin,
							sizeMax: ps.query?.sizeMax,
							kinds: ps.query?.kinds ? ps.query.kinds : undefined,
						},
					},
					{
						limit: ps.limit,
						page: ps.page,
					},
				);

				return {
					items: folders.items.map(it => ({
						...it,
						createdAt: this.idService.parse(it.id).date.toISOString(),
						kind: it.kind as 'file' | 'folder',
					})),
					count: folders.count,
					allCount: folders.allCount,
					allPages: folders.allPages,
				};
			} catch (e) {
				switch (true) {
					case e instanceof DriveFolderService.NoSuchFolderError:
						throw new ApiError(meta.errors.noSuchFolder);
					default:
						throw new ApiError();
				}
			}
		});
	}
}
