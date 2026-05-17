/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * e2e テスト用 codemod. `INestApplicationContext` 型と `app.close()` の呼び出しを
 * tsyringe ベースに置換する。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', 'test', 'e2e');

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.isFile() && /\.ts$/.test(entry.name)) out.push(full);
	}
	return out;
}

function transform(filePath, source) {
	if (!/INestApplicationContext|\.close\(\)/.test(source)) return null;

	let out = source;
	let changed = false;

	// 1. INestApplicationContext import を DependencyContainer 型に置換
	out = out.replace(/^\s*import\s+(?:type\s+)?\{\s*INestApplicationContext\s*\}\s+from\s+'@nestjs\/common';?\s*\n/gm, () => {
		changed = true;
		return "import type { DependencyContainer } from 'tsyringe';\nimport { DisposableRegistry } from '@/di/disposable-registry.js';\n";
	});

	out = out.replace(/\bINestApplicationContext\b/g, () => { changed = true; return 'DependencyContainer'; });

	// 2. `await <container>.close();` のうち、INestApplicationContext (DependencyContainer 化) の変数だけ disposeAll に置換。
	//    Fastify の close() などは触らないようにする (`queue` / `jq` / `app` / `module` 等の慣例的識別子のみ対象)。
	const containerIdents = new Set(['queue', 'jq', 'app', 'module', 'context', 'jobQueue']);
	out = out.replace(/await\s+(\w+)\.close\(\)/g, (full, ident) => {
		if (!containerIdents.has(ident)) return full;
		changed = true;
		return `await ${ident}.resolve(DisposableRegistry).disposeAll()`;
	});

	if (!changed) return null;
	return out;
}

function main() {
	const files = walk(root);
	let written = 0;
	for (const f of files) {
		const src = fs.readFileSync(f, 'utf8');
		const r = transform(f, src);
		if (r === null) continue;
		fs.writeFileSync(f, r);
		written++;
		console.log(`  ${path.relative(root, f)}`);
	}
	console.log(`codemod: ${written} files modified`);
}

main();
