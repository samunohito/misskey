/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
	test: {
		// Test environment
		environment: 'node',
		
		// Test file patterns
		include: [
			'test/unit/**/*.ts',
			'src/**/*.test.ts',
		],
		
		// Coverage configuration
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reportsDirectory: 'coverage',
		},
		
		// Timeout settings
		testTimeout: 60000,
		
		// Worker configuration to match Jest's memory management
		pool: 'threads',
		poolOptions: {
			threads: {
				singleThread: true, // Equivalent to maxWorkers: 1
			},
		},
		
		// Restore mocks between tests
		restoreMocks: true,
		
		// Global settings
		globals: true,
	},
	
	resolve: {
		alias: {
			// Match the tsconfig.json path alias
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
		extensions: ['.ts', '.js'],
	},
});
