/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type GridItem = {
	checked: boolean;
	id: string;
	name: string;
	fileType: string | null;
	size: number | null;
	comment: string | null;
	url: string | null;
	thumbnailUrl: string | null;
	isSensitive: boolean | null;
	isLink: boolean | null;
	kind: 'file' | 'folder'
}
