/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, beforeEach, describe, test, expect } from 'vitest';
import 'reflect-metadata';
import { createTestContainer } from '@/di/testing.js';
import { DisposableRegistry } from '@/di/disposable-registry.js';
import type { DependencyContainer } from 'tsyringe';
import {
	DeleteObjectCommand,
	DeleteObjectCommandOutput,
	InvalidObjectState,
	NoSuchKey,
	S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { DriveService } from '@/core/DriveService.js';
describe('DriveService', () => {
	let app: DependencyContainer;
	let driveService: DriveService;
	const s3Mock = mockClient(S3Client);

	beforeAll(async () => {
		app = await createTestContainer({
	loadGlobals: true,
	loadRepositories: true,
	register: (c) => {
		c.registerSingleton(DriveService);
	},
});
		driveService = app.resolve<DriveService>(DriveService);
	});

	beforeEach(async () => {
		s3Mock.reset();
	});

	afterAll(async () => {
		await app.resolve(DisposableRegistry).disposeAll();
	});

	describe('Object storage', () => {
		test('delete a file', async () => {
			s3Mock.on(DeleteObjectCommand)
				.resolves({} as DeleteObjectCommandOutput);

			await driveService.deleteObjectStorageFile('peace of the world');
		});

		test('delete a file then unexpected error', async () => {
			s3Mock.on(DeleteObjectCommand)
				.rejects(new InvalidObjectState({ $metadata: {}, message: '' }));

			await expect(driveService.deleteObjectStorageFile('unexpected')).rejects.toThrow(Error);
		});

		test('delete a file with no valid key', async () => {
			// Some S3 implementations returns 404 Not Found on deleting with a non-existent key
			s3Mock.on(DeleteObjectCommand)
				.rejects(new NoSuchKey({ $metadata: {}, message: 'allowed error.' }));

			await driveService.deleteObjectStorageFile('lol no way');
		});
	});
});
