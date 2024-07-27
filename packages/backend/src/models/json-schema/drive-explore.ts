/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedDriveExploreItemSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		createdAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
			example: '192.jpg',
		},
		fileType: {
			type: 'string',
			optional: false, nullable: true,
			example: 'image/jpeg',
		},
		size: {
			type: 'number',
			optional: false, nullable: true,
			example: 51469,
		},
		comment: {
			type: 'string',
			optional: false, nullable: true,
		},
		isSensitive: {
			type: 'boolean',
			optional: false, nullable: true,
		},
		isLink: {
			type: 'boolean',
			optional: false, nullable: true,
		},
		url: {
			type: 'string',
			optional: false, nullable: true,
			format: 'url',
		},
		thumbnailUrl: {
			type: 'string',
			optional: false, nullable: true,
			format: 'url',
		},
		kind: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['file', 'folder'],
		},
	},
} as const;
