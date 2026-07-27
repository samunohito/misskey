/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';

const sqlLoggerMock = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
}));

vi.mock('@/logger.js', () => ({
	default: class MockLogger {
		public createSubLogger(): typeof sqlLoggerMock {
			return sqlLoggerMock;
		}
	},
}));

const { createPostgresDataSource } = await import('@/postgres.js');

function createConfig(logging?: Config['logging']): Config {
	return {
		db: {
			host: 'localhost',
			port: 5432,
			db: 'misskey',
			user: 'misskey',
			pass: 'password',
			disableCache: true,
		},
		dbReplications: false,
		dbSlaves: undefined,
		redis: {
			host: 'localhost',
			port: 6379,
			pass: '',
			prefix: 'test',
		},
		logging,
	} as Config;
}

describe('PostgreSQL diagnostics logging', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('is disabled by default', () => {
		const dataSource = createPostgresDataSource(createConfig());

		expect(dataSource.options.logging).toBe(false);
		expect(dataSource.options.logger).toBeUndefined();
	});

	test('statement opt-in is bounded and never writes query parameters', () => {
		const dataSource = createPostgresDataSource(createConfig({ sql: { statement: true } }));
		const logger = dataSource.options.logger as { logQuery: (query: string, parameters?: unknown[]) => void };
		const query = `SELECT '${'あ'.repeat(3000)}'`;

		expect(dataSource.options.logging).toBe(true);
		expect(logger).toBeDefined();
		logger.logQuery(query, ['QUERY_PARAMETER_CANARY']);

		const message = String(sqlLoggerMock.info.mock.calls[0][0]);
		expect(sqlLoggerMock.info).toHaveBeenCalledOnce();
		expect(sqlLoggerMock.info.mock.calls[0]).toHaveLength(1);
		expect(message).not.toContain('QUERY_PARAMETER_CANARY');
		expect(Buffer.byteLength(message, 'utf8')).toBeLessThanOrEqual(8 * 1024);
	});
});
