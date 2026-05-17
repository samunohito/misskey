/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * `OnApplicationShutdown` -> `Disposable` codemod.
 *
 * 変換内容:
 *  - `implements OnApplicationShutdown` -> `implements Disposable`
 *  - `import ... { OnApplicationShutdown ... } from '@nestjs/common'` から OnApplicationShutdown を除去
 *  - `import { Disposable } from '@/di/disposable-registry.js'` を追加
 *  - constructor の引数末尾に `registry: DisposableRegistry` を追加
 *  - constructor body 先頭に `registry.register(this);` を追加
 *  - 既存 `dispose()` メソッドがあれば `onApplicationShutdown` メソッドを削除
 *  - 既存 `dispose()` メソッドが無ければ `onApplicationShutdown` を `dispose` に rename
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', 'src');

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.isFile() && /\.ts$/.test(entry.name)) out.push(full);
	}
	return out;
}

function findConstructorRange(source, startFrom = 0) {
	const ctorRe = /constructor\s*\(/g;
	ctorRe.lastIndex = startFrom;
	const m = ctorRe.exec(source);
	if (!m) return null;
	const openIdx = m.index + m[0].length - 1;
	let depth = 1;
	let i = openIdx + 1;
	while (i < source.length && depth > 0) {
		const ch = source[i];
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		if (depth === 0) break;
		i++;
	}
	if (depth !== 0) return null;
	// constructor body の '{' を探す
	let j = i + 1;
	while (j < source.length && source[j] !== '{') j++;
	if (j >= source.length) return null;
	return { paramsOpen: openIdx, paramsClose: i, bodyOpen: j };
}

function transform(filePath, source) {
	if (!/\bOnApplicationShutdown\b/.test(source)) return null;
	// DisposableRegistry.ts 自体はスキップ
	if (filePath.endsWith('disposable-registry.ts')) return null;

	let out = source;

	// 1. `implements OnApplicationShutdown` -> `implements Disposable`
	out = out.replace(/(\bimplements\s+)([\w,\s]*)\bOnApplicationShutdown\b/, (full, head, before) => {
		const others = before.split(',').map(s => s.trim()).filter(Boolean);
		const newList = [...others, 'Disposable'].join(', ');
		return `${head}${newList}`;
	});

	// 2. `import ... { OnApplicationShutdown ... } from '@nestjs/common'` から OnApplicationShutdown 除去
	out = out.replace(/^(\s*import\s+(?:type\s+)?\{)([^}]+)(\}\s+from\s+'@nestjs\/common';?\s*\n)/gm, (full, head, body, tail) => {
		const names = body.split(',').map(s => s.trim()).filter(Boolean);
		const filtered = names.filter(n => n !== 'OnApplicationShutdown' && n !== 'type OnApplicationShutdown');
		if (filtered.length === names.length) return full;
		if (filtered.length === 0) return '';
		return `${head} ${filtered.join(', ')} ${tail}`;
	});

	// 3. 既存 `public dispose()` メソッドがあるかチェック
	const hasDispose = /(?:public|private|protected)?\s*(?:async\s+)?dispose\s*\(/m.test(out);

	if (hasDispose) {
		// 4a. `onApplicationShutdown` メソッドを削除 (dispose() が既にある場合)
		out = out.replace(/\n\s*(?:@bindThis\s*\n\s*)?(?:public|private|protected)?\s*(?:async\s+)?onApplicationShutdown\s*\([^)]*\)\s*(?::\s*[\w<>|& ]+)?\s*\{[^]*?\n\t\}\n/, '\n');
	} else {
		// 4b. `onApplicationShutdown` を `dispose` に rename
		out = out.replace(/\bonApplicationShutdown\b/g, 'dispose');
	}

	// 5. import { Disposable, DisposableRegistry } from '@/di/disposable-registry.js'; を追加
	if (!/from\s+'@\/di\/disposable-registry\.js'/.test(out)) {
		const tsyringeImportRe = /^(\s*import\s+\{[^}]+\}\s+from\s+'tsyringe';?\s*\n)/m;
		if (tsyringeImportRe.test(out)) {
			out = out.replace(tsyringeImportRe, `$1import { Disposable, DisposableRegistry } from '@/di/disposable-registry.js';\n`);
		}
	} else {
		// 既存の import 行に Disposable / DisposableRegistry を merge する
		out = out.replace(/^(\s*import\s+\{)([^}]+)(\}\s+from\s+'@\/di\/disposable-registry\.js';?\s*\n)/m, (full, head, body, tail) => {
			const set = new Set(body.split(',').map(s => s.trim()).filter(Boolean));
			set.add('Disposable');
			set.add('DisposableRegistry');
			return `${head} ${[...set].sort().join(', ')} ${tail}`;
		});
	}

	// 6. `implements Disposable` の直後 (= 対象クラスの constructor) を取る
	const implIdx = out.search(/\bimplements\s+[\w,\s]*\bDisposable\b/);
	if (implIdx < 0) return out;
	const range = findConstructorRange(out, implIdx);
	if (range) {
		const params = out.slice(range.paramsOpen + 1, range.paramsClose);
		// 既に DisposableRegistry が含まれていればスキップ
		if (!/\bregistry\s*:\s*DisposableRegistry\b/.test(params)) {
			const trimmed = params.replace(/\s+$/, '');
			const trailingComma = trimmed.length === 0 || trimmed.endsWith(',') ? '' : ',';
			const newParams = `${trimmed}${trailingComma}\n\t\tregistry: DisposableRegistry,\n\t`;
			out = out.slice(0, range.paramsOpen + 1) + newParams + out.slice(range.paramsClose);

			// constructor body の `{` の直後に `registry.register(this);` を入れる
			const newRange = findConstructorRange(out, implIdx);
			if (newRange) {
				out = out.slice(0, newRange.bodyOpen + 1) + `\n\t\tregistry.register(this);` + out.slice(newRange.bodyOpen + 1);
			}
		}
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
