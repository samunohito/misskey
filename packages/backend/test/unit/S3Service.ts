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
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Service } from '@/core/S3Service.js';
import { MiMeta } from '@/models/_.js';
describe('S3Service', () => {
	let app: DependencyContainer;
	let s3Service: S3Service;
	const s3Mock = mockClient(S3Client);

	beforeAll(async () => {
		app = await createTestContainer({
	loadGlobals: true,
	register: (c) => {
		c.registerSingleton(S3Service);
	},
});
		s3Service = app.resolve<S3Service>(S3Service);
	});

	beforeEach(async () => {
		s3Mock.reset();
	});

	afterAll(async () => {
		await app.resolve(DisposableRegistry).disposeAll();
	});

	describe('upload', () => {
		test('upload a file', async () => {
			s3Mock.on(PutObjectCommand).resolves({});

			await s3Service.upload({ objectStorageRegion: 'us-east-1' } as MiMeta, {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x',
			});
		});

		test('upload a large file', async () => {
			s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: '1' });
			s3Mock.on(UploadPartCommand).resolves({ ETag: '1' });
			s3Mock.on(CompleteMultipartUploadCommand).resolves({ Bucket: 'fake', Key: 'fake' });

			await s3Service.upload({} as MiMeta, {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x'.repeat(8 * 1024 * 1024 + 1), // デフォルトpartSizeにしている 8 * 1024 * 1024 を越えるサイズ
			});
		});

		test('upload a file error', async () => {
			s3Mock.on(PutObjectCommand).rejects({ name: 'Fake Error' });

			await expect(s3Service.upload({ objectStorageRegion: 'us-east-1' } as MiMeta, {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x',
			})).rejects.toThrow(Error);
		});

		test('upload a large file error', async () => {
			s3Mock.on(UploadPartCommand).rejects();

			await expect(s3Service.upload({} as MiMeta, {
				Bucket: 'fake',
				Key: 'fake',
				Body: 'x'.repeat(8 * 1024 * 1024 + 1), // デフォルトpartSizeにしている 8 * 1024 * 1024 を越えるサイズ
			})).rejects.toThrow(Error);
		});
	});
});
