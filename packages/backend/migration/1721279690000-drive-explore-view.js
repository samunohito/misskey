/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DriveExploreView1721279690000 {
	name = 'DriveExploreView1721279690000';

	async up(queryRunner) {
		await queryRunner.query(`
		CREATE VIEW "drive_explore_view" AS
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
								 file."isLink"       as "isLink",
								 file."folderId"     as "parentId",
								 'file'              as "kind"
					FROM drive_file file
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
								 NULL              as "isLink",
								 folder."parentId" as "parentId",
								 'folder'          as "kind"
					FROM drive_folder folder) drive_explore_view;
		`);
	}

	async down(queryRunner) {
		await queryRunner.query('DROP VIEW "drive_explore_view"');
	}
}
