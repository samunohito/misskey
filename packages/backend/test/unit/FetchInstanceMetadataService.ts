/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mocked } from 'vitest';
import 'reflect-metadata';
import { createTestContainer } from '@/di/testing.js';
import { DisposableRegistry } from '@/di/disposable-registry.js';
import type { DependencyContainer } from 'tsyringe';
import { Redis } from 'ioredis';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';

function createMockRedis() {
	const store = new Map<string, string>();

	const del = vi.fn((key: string) => {
		const existed = store.delete(key);
		return Promise.resolve(existed ? 1 : 0);
	});

	const set = vi.fn((key: string, value: string, ...args: any[]) => {
		const prev = store.get(key) ?? null;
		store.set(key, value);

		// ioredis: SET key value ... GET => returns old value or null
		const hasGet = args.some(a => typeof a === 'string' && a.toUpperCase() === 'GET');
		return Promise.resolve(hasGet ? prev : 'OK');
	});

	return { set, del };
}

describe('FetchInstanceMetadataService', () => {
	let app: DependencyContainer;
	let fetchInstanceMetadataService: Mocked<FetchInstanceMetadataService>;
	let federatedInstanceService: Mocked<FederatedInstanceService>;
	let httpRequestService: Mocked<HttpRequestService>;
	let redisClient: Mocked<Redis>;

	beforeEach(async () => {
		app = await createTestContainer({
	loadGlobals: true,
	register: (c) => {
		c.registerSingleton(FetchInstanceMetadataService);
		c.registerSingleton(LoggerService);
		c.registerSingleton(UtilityService);
		c.registerSingleton(IdService);
	},
});
		fetchInstanceMetadataService = app.resolve<FetchInstanceMetadataService>(FetchInstanceMetadataService) as Mocked<FetchInstanceMetadataService>;
		federatedInstanceService = app.resolve<FederatedInstanceService>(FederatedInstanceService) as Mocked<FederatedInstanceService>;
		redisClient = app.resolve<Redis>(DI.redis) as Mocked<Redis>;
		httpRequestService = app.resolve<HttpRequestService>(HttpRequestService) as Mocked<HttpRequestService>;
	});

	afterEach(async () => {
		await app.resolve(DisposableRegistry).disposeAll();
		vi.resetAllMocks();
		vi.clearAllMocks();
	});

	test('Lock and update', async () => {
		const now = Date.now();
		federatedInstanceService.fetchOrRegister.mockResolvedValue({ infoUpdatedAt: { getTime: () => { return now - 10 * 1000 * 60 * 60 * 24; } } } as any);
		httpRequestService.getJson.mockImplementation(() => { throw Error(); });
		const tryLockSpy = vi.spyOn(fetchInstanceMetadataService, 'tryLock');
		const unlockSpy = vi.spyOn(fetchInstanceMetadataService, 'unlock');

		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: 'example.com' } as any);
		expect(tryLockSpy).toHaveBeenCalledTimes(1);
		expect(unlockSpy).toHaveBeenCalledTimes(1);
		expect(federatedInstanceService.fetchOrRegister).toHaveBeenCalledTimes(1);
		expect(httpRequestService.getJson).toHaveBeenCalled();
	});

	test('Lock and don\'t update', async () => {
		const now = Date.now();
		federatedInstanceService.fetchOrRegister.mockResolvedValue({ infoUpdatedAt: { getTime: () => now } } as any);
		httpRequestService.getJson.mockImplementation(() => { throw Error(); });
		const tryLockSpy = vi.spyOn(fetchInstanceMetadataService, 'tryLock');
		const unlockSpy = vi.spyOn(fetchInstanceMetadataService, 'unlock');

		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: 'example.com' } as any);
		expect(tryLockSpy).toHaveBeenCalledTimes(1);
		expect(unlockSpy).toHaveBeenCalledTimes(1);
		expect(federatedInstanceService.fetchOrRegister).toHaveBeenCalledTimes(1);
		expect(httpRequestService.getJson).toHaveBeenCalledTimes(0);
	});

	test('Do nothing when lock not acquired', async () => {
		const now = Date.now();
		federatedInstanceService.fetchOrRegister.mockResolvedValue({ infoUpdatedAt: { getTime: () => now - 10 * 1000 * 60 * 60 * 24 } } as any);
		httpRequestService.getJson.mockImplementation(() => { throw Error(); });
		await fetchInstanceMetadataService.tryLock('example.com');
		const tryLockSpy = vi.spyOn(fetchInstanceMetadataService, 'tryLock');
		const unlockSpy = vi.spyOn(fetchInstanceMetadataService, 'unlock');

		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: 'example.com' } as any);
		expect(tryLockSpy).toHaveBeenCalledTimes(1);
		expect(unlockSpy).toHaveBeenCalledTimes(0);
		expect(federatedInstanceService.fetchOrRegister).toHaveBeenCalledTimes(0);
		expect(httpRequestService.getJson).toHaveBeenCalledTimes(0);
	});

	test('Do when lock not acquired but forced', async () => {
		const now = Date.now();
		federatedInstanceService.fetchOrRegister.mockResolvedValue({ infoUpdatedAt: { getTime: () => now - 10 * 1000 * 60 * 60 * 24 } } as any);
		httpRequestService.getJson.mockImplementation(() => { throw Error(); });
		await fetchInstanceMetadataService.tryLock('example.com');
		const tryLockSpy = vi.spyOn(fetchInstanceMetadataService, 'tryLock');
		const unlockSpy = vi.spyOn(fetchInstanceMetadataService, 'unlock');

		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: 'example.com' } as any, true);
		expect(tryLockSpy).toHaveBeenCalledTimes(0);
		expect(unlockSpy).toHaveBeenCalledTimes(1);
		expect(federatedInstanceService.fetchOrRegister).toHaveBeenCalledTimes(0);
		expect(httpRequestService.getJson).toHaveBeenCalled();
	});
});
