/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * @nestjs/testing -> createTestContainer codemod.
 *
 * 機械的な置換のみ。各テストの providers の中身 (useFactory mock 等) は手動で
 * `mocks: [[X, ...]]` 形式に整理し直す必要がある。本 codemod は枠組みだけ整える。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', 'test');

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.isFile() && /\.ts$/.test(entry.name)) out.push(full);
	}
	return out;
}

function transform(filePath, source) {
	if (!source.includes('@nestjs/testing') && !source.includes('TestingModule')) return null;

	let out = source;

	// 1. `import { Test, TestingModule } from '@nestjs/testing';` -> tsyringe + createTestContainer
	out = out.replace(/^import\s+\{[^}]*\bTest\b[^}]*\}\s+from\s+'@nestjs\/testing';?\s*\n/gm, () => {
		return "import 'reflect-metadata';\nimport { createTestContainer } from '@/di/testing.js';\nimport type { DependencyContainer } from 'tsyringe';\n";
	});

	// 2. `TestingModule` 型を `DependencyContainer` に置換
	out = out.replace(/\bTestingModule\b/g, 'DependencyContainer');

	// 3. `import { GlobalModule } from '@/GlobalModule.js';` を削除
	out = out.replace(/^import\s+\{[^}]*\bGlobalModule\b[^}]*\}\s+from\s+'@\/GlobalModule\.js';?\s*\n/gm, '');

	// 4. `Test.createTestingModule(...).compile()` -> `createTestContainer({ ... })`
	// 注意: providers/imports 配列の中身は手動移植が必要。ここでは枠だけ作る。
	out = out.replace(/Test\s*\.\s*createTestingModule\(/g, 'createTestContainer(');
	out = out.replace(/\)\s*\.compile\(\)/g, ')');

	// 5. `app.get(X)` -> `app.resolve(X)`
	out = out.replace(/(\w+)\.get(<[^>]*>)?\(/g, (full, ident, generic) => {
		// `app.get(` のような典型形だけを対象に置換 (DI container 系)
		if (/^(app|module|c|container|testingModule)$/.test(ident)) {
			return `${ident}.resolve${generic ?? ''}(`;
		}
		return full;
	});

	// 6. `app.enableShutdownHooks()` を `await app.resolve(DisposableRegistry).disposeAll()` 呼び出しのコメントに
	out = out.replace(/(\w+)\.enableShutdownHooks\(\);?/g, '// TODO(nest->tsyringe): wire shutdown via DisposableRegistry');

	// 7. `await app.close();` を disposeAll に
	out = out.replace(/await\s+(\w+)\.close\(\);?/g, (full, ident) => {
		return `await ${ident}.resolve(DisposableRegistry).disposeAll();`;
	});

	// 8. DisposableRegistry を使う場合は import
	if (/DisposableRegistry/.test(out) && !/from\s+'@\/di\/disposable-registry\.js'/.test(out)) {
		out = out.replace(/^(import\s+\{ createTestContainer \}\s+from\s+'@\/di\/testing\.js';\s*\n)/m,
			`$1import { DisposableRegistry } from '@/di/disposable-registry.js';\n`);
	}

	return out;
}

function main() {
	const files = walk(root);
	let written = 0;
	for (const f of files) {
		const src = fs.readFileSync(f, 'utf8');
		const r = transform(f, src);
		if (r === null || r === src) continue;
		fs.writeFileSync(f, r);
		written++;
		console.log(`  ${path.relative(root, f)}`);
	}
	console.log(`codemod: ${written} files modified`);
}

main();
