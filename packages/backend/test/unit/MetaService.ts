/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, test, expect, vi } from 'vitest';
import 'reflect-metadata';
import { createTestContainer } from '@/di/testing.js';
import { DisposableRegistry } from '@/di/disposable-registry.js';
import type { DependencyContainer } from 'tsyringe';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';
import type { DataSource } from 'typeorm';

describe('MetaService', () => {
	let app: DependencyContainer;
	let metaService: MetaService;

	beforeAll(async () => {
		app = await createTestContainer({
	loadGlobals: true,
});
		metaService = app.resolve<MetaService>(MetaService, { strict: false });

		// Make it cached
		await metaService.fetch();
	});

	afterAll(async () => {
		await app.resolve(DisposableRegistry).disposeAll();
	});

	test('fetch (cache)', async () => {
		const db = app.resolve<DataSource>(DI.db);
		const spy = vi.spyOn(db, 'transaction');

		const result = await metaService.fetch();

		expect(result.id).toBe('x');
		expect(spy).toHaveBeenCalledTimes(0);
	});

	test('fetch (force)', async () => {
		const db = app.resolve<DataSource>(DI.db);
		const spy = vi.spyOn(db, 'transaction');

		const result = await metaService.fetch(true);

		expect(result.id).toBe('x');
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
