/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { type DriveFilesRepository, type DriveFoldersRepository, MiDriveFolder, MiUser } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { QueryService } from '@/core/QueryService.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { IdService } from '@/core/IdService.js';

@Injectable()
export class DriveFolderService {
	public static DriveFolderError = class extends Error {
	};
	public static NoSuchFolderError = class extends DriveFolderService.DriveFolderError {
	};
	public static NoSuchParentFolderError = class extends DriveFolderService.DriveFolderError {
	};
	public static HasChildFilesOrFoldersError = class extends DriveFolderService.DriveFolderError {
	};
	public static RecursiveNestingError = class extends DriveFolderService.DriveFolderError {
	};

	constructor(
		@Inject(DI.driveFoldersRepository)
		private driveFoldersRepository: DriveFoldersRepository,
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,
		private queryService: QueryService,
		private idService: IdService,
	) {
	}

	@bindThis
	public get(params: { id: MiDriveFolder['id'], userId: MiUser['id'] | null }): Promise<MiDriveFolder | null> {
		return this.driveFoldersRepository.findOneBy({ id: params.id, userId: params.userId });
	}

	/**
	 * ドライブフォルダを検索する.
	 * いずれの検索条件も指定されなかった場合は, 登録されている全てのファイルを取得するので注意.
	 *
	 * 1つの検索項目に複数の値が指定された場合は、それらの値をORで結合する.
	 * 複数の検索項目に条件が指定された場合は、それらの条件をANDで結合する.
	 *
	 * @param params
	 * @param {string | undefined} params.sinceId 検索開始ID
	 * @param {string | undefined} params.untilId 検索終了ID
	 * @param {(MiUser['id'] | null)[] | undefined} params.userIds 検索対象のユーザID
	 * @param {MiDriveFolder['id'][] | undefined} params.parentIds 該当のフォルダを親として持つフォルダを検索する
	 * @param opts
	 * @param {number | undefined} opts.limit 取得する最大件数. 省略時は無制限
	 * @param {boolean | undefined} opts.idOnly IDのみ取得するかどうか. 省略時はfalse
	 */
	@bindThis
	public search(
		params: {
			sinceId?: MiDriveFolder['id'],
			untilId?: MiDriveFolder['id'],
			userIds?: (MiUser['id'] | null)[],
			names?: string[],
			parentIds?: MiDriveFolder['id'][],
		},
		opts?: {
			limit?: number,
			idOnly?: boolean,
		},
	): Promise<MiDriveFolder[]> {
		const query = this.queryService.makePaginationQuery(
			this.driveFoldersRepository.createQueryBuilder('folder'), params.sinceId, params.untilId,
		);

		if (params.userIds && params.userIds.length > 0) {
			const includeNull = params.userIds.includes(null);
			const withoutNull = params.userIds.filter(x => x != null);
			query.andWhere(new Brackets(qb => {
				if (includeNull) {
					qb.orWhere('folder.userId IS NULL');
				}
				if (withoutNull.length > 0) {
					qb.orWhere('folder.userId IN (:...userIds)', { userIds: withoutNull });
				}
			}));
		}

		if (params.names && params.names.length > 0) {
			query.andWhere('folder.name LIKE ANY(:...names)', {
				names: params.names.map(x => '%' + sqlLikeEscape(x) + '%'),
			});
		}

		if (params.parentIds && params.parentIds.length > 0) {
			query.andWhere('folder.parentId IN (:...parentIds)', { parentIds: params.parentIds });
		}

		if (opts?.idOnly) {
			query.select('folder.id');
		}

		if (opts?.limit) {
			query.limit(opts.limit);
		}

		return query.getMany();
	}

	@bindThis
	public async exists(params: {
		id: MiDriveFolder['id'],
		userId: MiUser['id'] | null,
	}): Promise<boolean> {
		const query = this.driveFoldersRepository.createQueryBuilder('folder')
			.where('folder.id = :id', { id: params.id });

		if (params.userId != null) {
			query.andWhere('folder.userId = :userId', { userId: params.userId });
		} else {
			query.andWhere('folder.userId IS NULL');
		}

		return query.getExists();
	}

	@bindThis
	public async hasChildren(id: MiDriveFolder['id']): Promise<boolean> {
		const [childFoldersCount, childFilesCount] = await Promise.all([
			this.driveFoldersRepository.countBy({ parentId: id }),
			this.driveFilesRepository.countBy({ folderId: id }),
		]);

		return childFoldersCount !== 0 || childFilesCount !== 0;
	}

	@bindThis
	public async create(
		params: {
			userId: MiUser['id'] | null,
			name: MiDriveFolder['name'],
			parentId?: MiDriveFolder['id'] | null,
		},
	): Promise<MiDriveFolder> {
		if (params.parentId && await this.exists({ id: params.parentId, userId: params.userId })) {
			throw new DriveFolderService.NoSuchFolderError;
		}

		return await this.driveFoldersRepository.insertOne({
			id: this.idService.gen(),
			name: params.name,
			parentId: params.parentId ? params.parentId : null,
			userId: null,
		});
	}

	@bindThis
	public async update(
		params: {
			id: MiDriveFolder['id'],
			userId: MiUser['id'] | null,
		},
		patch: {
			name?: MiDriveFolder['name'],
			parentId?: MiDriveFolder['id'] | null,
		},
	) {
		const folder = await this.get(params);
		if (folder == null) {
			throw new DriveFolderService.NoSuchFolderError;
		}

		if (patch.name) {
			folder.name = patch.name;
		}

		if (patch.parentId !== undefined) {
			if (patch.parentId === folder.id) {
				throw new DriveFolderService.RecursiveNestingError;
			}

			if (patch.parentId !== null) {
				if (await this.exists({ id: patch.parentId, userId: params.userId })) {
					throw new DriveFolderService.NoSuchParentFolderError;
				}

				const checkCircle = async (folderId: MiDriveFolder['id']): Promise<boolean> => {
					const folder2 = await this.get({ id: folderId, userId: params.userId });
					if (folder2 == null) {
						throw new DriveFolderService.NoSuchFolderError;
					}

					if (folder2.id === folder.id) {
						return true;
					} else if (folder2.parentId) {
						return await checkCircle(folder2.parentId);
					} else {
						return false;
					}
				};

				if (await checkCircle(patch.parentId)) {
					throw new DriveFolderService.RecursiveNestingError;
				}
			}

			folder.parentId = patch.parentId;
		}

		await this.driveFoldersRepository.update(folder.id, {
			name: folder.name,
			parentId: folder.parentId,
		});

		return folder;
	}

	@bindThis
	public async delete(params: { id: MiDriveFolder['id'], userId: MiUser['id'] | null }): Promise<void> {
		if (await this.exists(params)) {
			throw new DriveFolderService.NoSuchFolderError;
		}

		if (await this.hasChildren(params.id)) {
			throw new DriveFolderService.HasChildFilesOrFoldersError;
		}

		await this.driveFoldersRepository.delete(params.id);
	}
}
