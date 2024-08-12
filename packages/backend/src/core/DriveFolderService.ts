/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import {
	type DriveExploreViewRepository,
	type DriveFilesRepository,
	type DriveFoldersRepository,
	MiDriveFolder,
	MiUser,
} from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { QueryService } from '@/core/QueryService.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { IdService } from '@/core/IdService.js';
import { ExploreKind } from '@/models/DriveExploreView.js';

export const exploreSortKeys = [
	'+id',
	'-id',
	'+name',
	'-name',
	'+fileType',
	'-fileType',
	'+size',
	'-size',
	'+comment',
	'-comment',
	'+isSensitive',
	'-isSensitive',
	'+kind',
	'-kind',
];
export type ExploreSortKey = typeof exploreSortKeys[number];

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
		@Inject(DI.driveExploreViewRepository)
		private driveExploreViewRepository: DriveExploreViewRepository,
		private queryService: QueryService,
		private idService: IdService,
	) {
	}

	@bindThis
	public get(params: { id: MiDriveFolder['id'], userId: MiUser['id'] | null }): Promise<MiDriveFolder | null> {
		return this.driveFoldersRepository.findOneBy({ id: params.id, userId: params.userId ? params.userId : IsNull() });
	}

	/**
	 * 引数で指定されたフォルダの親フォルダを再帰的に取得し、ルートフォルダまでの階層を取得する.
	 * ルートフォルダは配列の先頭に格納される.
	 *
	 * @param params
	 * @param {MiUser['id'] | null} params.userId ユーザID
	 * @param {MiDriveFolder['id']} params.currentFolderId フォルダID
	 */
	@bindThis
	public async pwd(params: { userId: MiUser['id'] | null, currentFolderId: MiDriveFolder['id'] | null }) {
		if (!params.currentFolderId) {
			// フォルダIDが無ければ最終的に空配列が返るので、あらかじめ早期リターンしておく
			return [];
		}

		const folders = await this.driveFoldersRepository
			.findBy({ userId: params.userId ? params.userId : IsNull() })
			.then(folders => new Map(folders.map(folder => [folder.id, folder])));

		const result: MiDriveFolder[] = [];
		let current = folders.get(params.currentFolderId);
		while (current) {
			result.unshift(current);

			const parentId = current.parentId;
			current = parentId ? folders.get(parentId) : undefined;
			if ((current?.id ?? null) !== parentId) {
				throw new DriveFolderService.NoSuchParentFolderError;
			}
		}

		return result;
	}

	/**
	 * ドライブフォルダを探索する.
	 * フォルダの中にあるファイル・フォルダをすべて列挙しつつ、検索条件に合致するものを取得する.
	 * 1つの検索項目に複数の値が指定された場合は、それらの値をORで結合する.
	 * 複数の検索項目に条件が指定された場合は、それらの条件をANDで結合する.
	 *
	 * @param params
	 * @param {MiUser['id'] | null} params.userId 検索対象のユーザID
	 * @param {MiDriveFolder['id'] | null} params.currentFolderId 内容を取得するフォルダのID
	 * @param {object} params.query 検索条件
	 * @param {string[] | undefined} params.query.names ファイル名
	 * @param {string[] | undefined} params.query.fileTypes ファイル種別
	 * @param {string[] | undefined} params.query.commentWords コメント
	 * @param {boolean | undefined} params.query.isSensitive センシティブフラグつきファイルかどうか
	 * @param {number | undefined} params.query.sizeMin ファイルサイズの最小値
	 * @param {number | undefined} params.query.sizeMax ファイルサイズの最大値
	 * @param {ExploreKind[] | undefined} params.query.kinds ファイル種別
	 * @param opts
	 * @param {number | undefined} opts.limit 取得する最大件数. 省略時は10
	 * @param {number | undefined} opts.page ページ番号. 省略時は1
	 * @param {ExploreSortKey[] | undefined} opts.sortKeys ソートキー
	 */
	@bindThis
	public async explore(
		params: {
			userId: MiUser['id'] | null,
			currentFolderId: MiDriveFolder['id'] | null,
			query: {
				names?: string[],
				fileTypes?: string[],
				commentWords?: string[],
				isSensitive?: boolean,
				sizeMin?: number,
				sizeMax?: number,
				kinds?: ExploreKind[],
			}
		},
		opts?: {
			limit?: number,
			page?: number,
			sortKeys?: ExploreSortKey[],
		},
	) {
		const query = params.query;
		const builder = this.driveExploreViewRepository.createQueryBuilder('drive_explore');

		if (params.userId) {
			builder.andWhere('drive_explore.userId = :userId', { userId: params.userId });
		} else {
			builder.andWhere('drive_explore.userId IS NULL');
		}

		if (params.currentFolderId) {
			if (!await this.exists({ id: params.currentFolderId, userId: params.userId })) {
				throw new DriveFolderService.NoSuchFolderError;
			}

			builder.andWhere('drive_explore."parentId" = :currentFolderId', { currentFolderId: params.currentFolderId });
		} else {
			builder.andWhere('drive_explore."parentId" IS NULL');
		}

		if (query.names && query.names.length > 0) {
			builder.andWhere('drive_explore.name LIKE ANY(ARRAY[:...names])', {
				names: query.names.map(x => '%' + sqlLikeEscape(x) + '%'),
			});
		}

		if (query.fileTypes && query.fileTypes.length > 0) {
			builder.andWhere('drive_explore.fileType IN (:...fileTypes)', { fileTypes: query.fileTypes });
		}

		if (query.commentWords && query.commentWords.length > 0) {
			builder.andWhere('drive_explore.comment LIKE ANY(ARRAY[:...commentWords])', {
				commentWords: query.commentWords.map(x => '%' + sqlLikeEscape(x) + '%'),
			});
		}

		if (query.isSensitive !== undefined) {
			builder.andWhere(new Brackets(qb => {
				qb.orWhere('drive_explore.isSensitive = :isSensitive', { isSensitive: query.isSensitive });
				qb.orWhere('drive_explore.isSensitive IS NULL');
			}));
		}

		if (query.sizeMin !== undefined) {
			builder.andWhere(new Brackets(qb => {
				qb.andWhere('drive_explore.kind = \'file\'');
				qb.andWhere('drive_explore.size >= :sizeMin', { sizeMin: query.sizeMin });
			}));
		}

		if (query.sizeMax !== undefined) {
			builder.andWhere(new Brackets(qb => {
				qb.andWhere('drive_explore.kind = \'file\'');
				qb.andWhere('drive_explore.size <= :sizeMax', { sizeMax: query.sizeMax });
			}));
		}

		if (query.kinds && query.kinds.length > 0 && !query.kinds.includes('all')) {
			builder.andWhere('drive_explore.kind IN (:...exploreKinds)', { exploreKinds: query.kinds });
		}

		if (opts?.sortKeys && opts.sortKeys.length > 0) {
			for (const sortKey of opts.sortKeys) {
				const direction = sortKey.startsWith('-') ? 'DESC' : 'ASC';
				const key = sortKey.replace(/^[+-]/, '');
				switch (key) {
					case 'id': {
						builder.addOrderBy('drive_explore.id', direction);
						break;
					}
					case 'name': {
						builder.addOrderBy('drive_explore.name', direction);
						break;
					}
					case 'fileType': {
						builder.addOrderBy('drive_explore.fileType', direction);
						break;
					}
					case 'size': {
						builder.addOrderBy('drive_explore.size', direction);
						break;
					}
					case 'comment': {
						builder.addOrderBy('drive_explore.comment', direction);
						break;
					}
					case 'isSensitive': {
						builder.addOrderBy('drive_explore.isSensitive', direction);
						break;
					}
					case 'kind': {
						builder.addOrderBy('drive_explore.kind', direction);
						break;
					}
				}
			}
		} else {
			builder
				.addOrderBy('drive_explore.kind', 'DESC')
				.addOrderBy('drive_explore.id', 'ASC');
		}

		const limit = opts?.limit ?? 10;
		if (opts?.page) {
			builder.skip(limit * (opts.page - 1));
		}

		builder.take(limit);

		const [items, count] = await builder.getManyAndCount();
		return {
			items: items,
			count: (count > limit ? items.length : count),
			allCount: count,
			allPages: Math.ceil(count / limit),
		};
	}

	/**
	 * ドライブフォルダを検索する.
	 * 1つの検索項目に複数の値が指定された場合は、それらの値をORで結合する.
	 * 複数の検索項目に条件が指定された場合は、それらの条件をANDで結合する.
	 *
	 * 検索APIから呼ぶことを想定しているため、別Serviceからの呼び出しなどで使う場合はページング処理の負荷を加味する事(必要なら該当処理を省いたものを作成する等).
	 *
	 * @param params
	 * @param {string | undefined} params.sinceId 検索開始ID
	 * @param {string | undefined} params.untilId 検索終了ID
	 * @param {(MiUser['id'] | null)[] | undefined} params.userIds 検索対象のユーザID
	 * @param {MiDriveFolder['id'][] | undefined} params.parentIds 該当のフォルダを親として持つフォルダを検索する
	 * @param opts
	 * @param {number | undefined} opts.limit 取得する最大件数. 省略時は10
	 * @param {number | undefined} opts.page ページ番号. 省略時は1
	 * @param {boolean | undefined} opts.idOnly IDのみ取得するかどうか. 省略時はfalse
	 */
	@bindThis
	public async search(
		params: {
			sinceId?: MiDriveFolder['id'],
			untilId?: MiDriveFolder['id'],
			userIds?: (MiUser['id'] | null)[],
			names?: string[],
			parentIds?: MiDriveFolder['id'][],
		},
		opts?: {
			limit?: number,
			page?: number,
			idOnly?: boolean,
		},
	) {
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

		const limit = opts?.limit ?? 10;
		if (opts?.page) {
			query.skip(limit * (opts.page - 1));
		}

		query.take(limit);

		const [items, count] = await query.getManyAndCount();
		return {
			items,
			count,
			allCount: count,
			allPages: Math.ceil(count / (opts?.limit ?? count)),
		};
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
		if (params.parentId && !(await this.exists({ id: params.parentId, userId: params.userId }))) {
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
