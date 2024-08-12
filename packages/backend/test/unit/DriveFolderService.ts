/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DriveFolderService } from '@/core/DriveFolderService.js';
import {
	DriveExploreViewRepository,
	DriveFilesRepository,
	DriveFoldersRepository, MiDriveFile, MiDriveFolder,
	MiUser, UserProfilesRepository,
	UsersRepository,
} from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';

describe('DriveFolderService', () => {
	let app: TestingModule;
	let service: DriveFolderService;

	// --------------------------------------------------------------------------------------

	let driveFoldersRepository: DriveFoldersRepository;
	let driveFilesRepository: DriveFilesRepository;
	let driveExploreViewRepository: DriveExploreViewRepository;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let idService: IdService;

	// --------------------------------------------------------------------------------------

	let root: MiUser;
	let alice: MiUser;
	let bob: MiUser;

	// --------------------------------------------------------------------------------------

	async function createUser(data: Partial<MiUser> = {}) {
		const user = await usersRepository
			.insert({
				id: idService.gen(),
				...data,
			})
			.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));

		await userProfilesRepository.insert({
			userId: user.id,
		});

		return user;
	}

	async function createFolder(data: Partial<MiDriveFolder> = {}) {
		return driveFoldersRepository.insert({
			id: idService.gen(),
			...data,
		});
	}

	async function createFile(data: Partial<MiDriveFile> = {}) {
		return driveFilesRepository.insert({
			id: idService.gen(),
			...data,
		});
	}

	// --------------------------------------------------------------------------------------

	beforeAll(async () => {
		app = await Test.createTestingModule({
			providers: [
				IdService,
				DriveFolderService,
			],
		}).compile();

		service = app.get<DriveFolderService>(DriveFolderService);
		idService = app.get(IdService);
		driveFoldersRepository = app.get<DriveFoldersRepository>(DI.driveFilesRepository);
		driveFilesRepository = app.get<DriveFilesRepository>(DI.driveFilesRepository);
		driveExploreViewRepository = app.get<DriveExploreViewRepository>(DI.driveExploreViewRepository);

		app.enableShutdownHooks();
	});

	beforeEach(async () => {
		root = await createUser({ username: 'root', usernameLower: 'root', isRoot: true });
		alice = await createUser({ username: 'alice', usernameLower: 'alice', isRoot: false });
		bob = await createUser({ username: 'bob', usernameLower: 'bob', isRoot: false });
	});

	afterEach(async () => {
		await driveFoldersRepository.delete({});
		await driveFilesRepository.delete({});
	});

	afterAll(async () => {
		await app.close();
	});

	// --------------------------------------------------------------------------------------

	describe('pwd', () => {

	});

	describe('explore', () => {

	});

	describe('exists', () => {

	});

	describe('hasChildren', () => {

	});

	describe('create', () => {

	});

	describe('update', () => {

	});

	describe('delete', () => {

	});
});
