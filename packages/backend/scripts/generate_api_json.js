/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// gen-spec.js は tsyringe デコレータを含むモジュール (DisposableRegistry 等) を間接 import するため、
// このスクリプト単体で実行するときは reflect-metadata polyfill を最初にロードする必要がある。
import 'reflect-metadata';
import { writeFileSync, existsSync } from 'node:fs';
import { execa } from 'execa';

async function main() {
	if (!process.argv.includes('--no-build')) {
		await execa('pnpm', ['run', 'build'], {
			stdout: process.stdout,
			stderr: process.stderr,
		});
	}

	if (!existsSync('./built')) {
		throw new Error('`built` directory does not exist.');
	}

	/** @type {import('../src/config.js')} */
	const { loadConfig } = await import('../built/config.js');

	/** @type {import('../src/server/api/openapi/gen-spec.js')} */
	const { genOpenapiSpec } = await import('../built/gen-spec.js');

	const config = loadConfig();
	const spec = genOpenapiSpec(config, true);

	writeFileSync('./built/api.json', JSON.stringify(spec), 'utf-8');
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
