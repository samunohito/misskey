/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ViewColumn, ViewEntity } from 'typeorm';

export const exploreKinds = ['file', 'folder'];
export type ExploreKind = typeof exploreKinds[number];

@ViewEntity({
	name: 'drive_explore_view',
	expression: `
		SELECT *
		FROM (SELECT file."id"           as "id",
								 file."userId"       as "userId",
								 file."userHost"     as "userHost",
								 file."name"         as "name",
								 file."type"         as "fileType",
								 file."size"         as "size",
								 file."comment"      as "comment",
								 file."url"          as "url",
								 file."thumbnailUrl" as "thumbnailUrl",
								 file."isSensitive"  as "isSensitive",
								 file."folderId"     as "parentId",
								 'file'              as "kind"
					FROM drive_file file
					WHERE file."isLink" = FALSE
					UNION ALL
					SELECT folder."id"       as "id",
								 folder."userId"   as "userId",
								 NULL              as "userHost",
								 folder."name"     as "name",
								 NULL              as "fileType",
								 NULL              as "size",
								 NULL              as "comment",
								 NULL              as "url",
								 NULL              as "thumbnailUrl",
								 NULL              as "isSensitive",
								 folder."parentId" as "parentId",
								 'folder'          as "kind"
					FROM drive_folder folder) drive_explore_view;
	`,
})
export class MiDriveExploreView {
	@ViewColumn()
	public id: string;
	@ViewColumn()
	public userId: string;
	@ViewColumn()
	public userHost: string | null;
	@ViewColumn()
	public name: string;
	@ViewColumn()
	public fileType: string | null;
	@ViewColumn()
	public size: number | null;
	@ViewColumn()
	public comment: string | null;
	@ViewColumn()
	public url: string | null;
	@ViewColumn()
	public thumbnailUrl: string | null;
	@ViewColumn()
	public isSensitive: boolean | null;
	@ViewColumn()
	public isLink: boolean | null;
	@ViewColumn()
	public kind: ExploreKind;
}
