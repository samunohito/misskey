/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineConfig } from 'rolldown';

export default defineConfig({
	input: './poc/tsyringe-poc.ts',
	platform: 'node',
	tsconfig: './tsconfig.json',
	output: {
		keepNames: true,
		dir: './poc/built',
		cleanDir: true,
		format: 'esm',
	},
});
