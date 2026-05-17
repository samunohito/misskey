/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * @nestjs/testing -> createTestContainer codemod.
 *
 * 機械的な置換:
 *  - import の整形
 *  - `Test.createTestingModule({...}).compile()` -> `createTestContainer({...})`
 *  - `imports: [GlobalModule]` -> `loadGlobals: true`
 *  - `imports: [GlobalModule, X, Y]` (GlobalModule + 何か) -> `loadGlobals: true` (他の Module は捨てる、コメントで残す)
 *  - `providers: [Service1, { provide: X, useFactory: ... }, ...]` -> register + mocks の組合せ
 *  - `app.get(X)` -> `app.resolve(X)`
 *  - `app.enableShutdownHooks()` -> 削除
 *  - `await app.close()` -> `await app.resolve(DisposableRegistry).disposeAll()`
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

// `Test.createTestingModule({ imports: [...], providers: [...] }).compile()` を解析して
// `createTestContainer({ loadGlobals, register, mocks })` 形に変換する。
// `source[idx]` が開き括弧 ('(' or '{' or '[') の前提で、対応する閉じ括弧の次の位置を返す。
// 文字列リテラル内の括弧は無視する。
function matchBalanced(source, idx) {
	const open = source[idx];
	const close = { '(': ')', '{': '}', '[': ']' }[open];
	if (!close) return -1;
	let depth = 1;
	let i = idx + 1;
	let inStr = null;
	while (i < source.length && depth > 0) {
		const ch = source[i];
		if (inStr) {
			if (ch === '\\') { i += 2; continue; }
			if (ch === inStr) inStr = null;
		} else if (ch === '"' || ch === "'" || ch === '`') {
			inStr = ch;
		} else if (ch === '(' || ch === '{' || ch === '[') depth++;
		else if (ch === ')' || ch === '}' || ch === ']') {
			depth--;
			if (depth === 0) return i + 1;
		}
		i++;
	}
	return -1;
}

// `Test.createTestingModule({...})` から `.compile()` までのチェーン全体を解析して
// `createTestContainer({...})` に変換する。チェーンには
//   .overrideProvider(X).useValue(Y) / .useFactory(fn) / .useClass(C)
// が任意個入り得る。これらは mocks / register に振り分ける。
function transformTestingModuleCall(source) {
	const startMatch = source.match(/Test\s*\.\s*createTestingModule\(/);
	if (!startMatch) return source;
	const startIdx = startMatch.index;

	const openParen = startIdx + startMatch[0].length - 1; // '(' の位置
	const closeParen = matchBalanced(source, openParen);
	if (closeParen < 0) return source;

	// body は最初の {...} を期待
	const bodyOpen = source.indexOf('{', openParen + 1);
	if (bodyOpen < 0 || bodyOpen >= closeParen) return source;
	const bodyClose = matchBalanced(source, bodyOpen);
	if (bodyClose < 0 || bodyClose > closeParen) return source;
	const body = source.slice(bodyOpen + 1, bodyClose - 1);

	// チェーン解析
	const overrideMocks = [];
	const overrideRegisters = [];
	let cursor = closeParen;
	let endIdx = -1;
	while (cursor < source.length) {
		while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
		if (source[cursor] !== '.') return source;
		cursor++;
		while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
		const nameMatch = source.slice(cursor).match(/^(\w+)/);
		if (!nameMatch) return source;
		const name = nameMatch[1];
		cursor += name.length;
		while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
		if (source[cursor] !== '(') return source;
		const argOpen = cursor;
		const argClose = matchBalanced(source, argOpen);
		if (argClose < 0) return source;
		const argText = source.slice(argOpen + 1, argClose - 1);
		cursor = argClose;

		if (name === 'compile') {
			endIdx = cursor;
			break;
		}
		if (name === 'overrideProvider') {
			const token = argText.trim();
			while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
			if (source[cursor] !== '.') return source;
			cursor++;
			while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
			const useMatch = source.slice(cursor).match(/^(useValue|useFactory|useClass)/);
			if (!useMatch) return source;
			const useKind = useMatch[1];
			cursor += useKind.length;
			while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
			if (source[cursor] !== '(') return source;
			const useArgOpen = cursor;
			const useArgClose = matchBalanced(source, useArgOpen);
			if (useArgClose < 0) return source;
			const useArg = source.slice(useArgOpen + 1, useArgClose - 1).trim();
			cursor = useArgClose;
			if (useKind === 'useValue') {
				overrideMocks.push(`[${token}, ${useArg}]`);
			} else if (useKind === 'useFactory') {
				// NestJS の `.useFactory({factory: () => v})` 等価: 登録時に factory を呼ぶ。
				overrideMocks.push(`[${token}, (${useArg}).factory()]`);
			} else if (useKind === 'useClass') {
				overrideRegisters.push(`\t\tc.register(${token}, { useClass: ${useArg} });`);
			}
			continue;
		}
		return source;
	}
	if (endIdx < 0) return source;

	const importsRange = findArrayRange(body, 'imports');
	const providersRange = findArrayRange(body, 'providers');

	const imports = importsRange ? body.slice(importsRange.openIdx + 1, importsRange.closeIdx) : '';
	const providers = providersRange ? body.slice(providersRange.openIdx + 1, providersRange.closeIdx) : '';

	const loadGlobals = /\bGlobalModule\b/.test(imports);

	const providerItems = splitTopLevel(providers);
	const registerLines = [];
	const mockLines = [];

	for (const item of providerItems) {
		const t = item.trim();
		if (!t) continue;
		const useFactory = t.match(/provide\s*:\s*([^,}]+?)\s*,\s*useFactory\s*:\s*([\s\S]*)/);
		const useValue = t.match(/provide\s*:\s*([^,}]+?)\s*,\s*useValue\s*:\s*([\s\S]*)/);
		const useClass = t.match(/provide\s*:\s*([^,}]+?)\s*,\s*useClass\s*:\s*([\s\S]*)/);
		const cleanTail = (s) => {
			let r = s.trim();
			while (/[,}]\s*$/.test(r)) r = r.replace(/[,}]\s*$/, '').trim();
			return r;
		};
		if (useFactory) {
			const provide = useFactory[1].trim();
			const factory = cleanTail(useFactory[2]);
			mockLines.push(`[${provide}, (${factory})()]`);
		} else if (useValue) {
			const provide = useValue[1].trim();
			const value = cleanTail(useValue[2]);
			mockLines.push(`[${provide}, ${value}]`);
		} else if (useClass) {
			const provide = useClass[1].trim();
			const cls = cleanTail(useClass[2]);
			registerLines.push(`\t\tc.register(${provide}, { useClass: ${cls} });`);
		} else {
			registerLines.push(`\t\tc.registerSingleton(${t});`);
		}
	}

	// override 由来のものは providers 由来より後に積んで優先度を高くする
	registerLines.push(...overrideRegisters);
	mockLines.push(...overrideMocks);

	const optsParts = [];
	if (loadGlobals) optsParts.push('\tloadGlobals: true');
	if (registerLines.length > 0) optsParts.push(`\tregister: (c) => {\n${registerLines.join('\n')}\n\t}`);
	if (mockLines.length > 0) optsParts.push(`\tmocks: [\n\t\t${mockLines.join(',\n\t\t')},\n\t]`);

	const replacement = `createTestContainer({\n${optsParts.join(',\n')},\n})`;
	return source.slice(0, startIdx) + replacement + source.slice(endIdx);
}

function findArrayRange(source, key) {
	const re = new RegExp(`${key}\\s*:\\s*\\[`);
	const m = source.match(re);
	if (!m) return null;
	const openIdx = m.index + m[0].length - 1;
	let depth = 1;
	let i = openIdx + 1;
	while (i < source.length && depth > 0) {
		const ch = source[i];
		if (ch === '[') depth++;
		else if (ch === ']') depth--;
		if (depth === 0) break;
		i++;
	}
	return depth === 0 ? { openIdx, closeIdx: i } : null;
}

// トップレベルのカンマで配列の要素を分割
function splitTopLevel(s) {
	const items = [];
	let depth = 0;
	let buf = '';
	for (const ch of s) {
		if ('([{'.includes(ch)) depth++;
		else if (')]}'.includes(ch)) depth--;
		if (depth === 0 && ch === ',') {
			items.push(buf);
			buf = '';
		} else {
			buf += ch;
		}
	}
	if (buf.trim()) items.push(buf);
	return items;
}

function transform(filePath, source) {
	if (!source.includes('@nestjs/testing') && !/\bTestingModule\b/.test(source)) return null;

	let out = source;

	// 1. `import { Test, TestingModule } from '@nestjs/testing'` を置換
	let injectedHeader = false;
	out = out.replace(/^import\s+(?:type\s+)?\{[^}]*\bTest\b[^}]*\}\s+from\s+'@nestjs\/testing';?\s*\n/gm, () => {
		injectedHeader = true;
		return "import 'reflect-metadata';\nimport { createTestContainer } from '@/di/testing.js';\nimport { DisposableRegistry } from '@/di/disposable-registry.js';\nimport type { DependencyContainer } from 'tsyringe';\n";
	});

	// 2. 残った `import ... from '@nestjs/testing'` (TestingModule のみの行など) を削除。
	// ヘッダ行を 1 回だけ挿入する。
	out = out.replace(/^import\s+(?:type\s+)?\{[^}]+\}\s+from\s+'@nestjs\/testing';?\s*\n/gm, () => {
		if (injectedHeader) return '';
		injectedHeader = true;
		return "import 'reflect-metadata';\nimport { createTestContainer } from '@/di/testing.js';\nimport { DisposableRegistry } from '@/di/disposable-registry.js';\nimport type { DependencyContainer } from 'tsyringe';\n";
	});

	// 3. `TestingModule` 型 -> `DependencyContainer`
	out = out.replace(/\bTestingModule\b/g, 'DependencyContainer');

	// 3. 旧 GlobalModule / CoreModule の import 行を削除
	out = out.replace(/^import\s+\{[^}]*\bGlobalModule\b[^}]*\}\s+from\s+'@\/GlobalModule\.js';?\s*\n/gm, '');
	out = out.replace(/^import\s+\{[^}]*\bCoreModule\b[^}]*\}\s+from\s+'@\/core\/CoreModule\.js';?\s*\n/gm, '');

	// 4. Test.createTestingModule(...).compile() を解析変換 (複数回呼び出しに対応してループ)
	let prev;
	do {
		prev = out;
		out = transformTestingModuleCall(out);
	} while (prev !== out);

	// 5. `app.get(X)` -> `app.resolve(X)` (DI container 系の typical 識別子のみ)
	out = out.replace(/(\b(?:app|module|c|container|testingModule)\b)\.get(<[^>]*>)?\(/g, (full, ident, generic) => {
		return `${ident}.resolve${generic ?? ''}(`;
	});

	// 6. `app.enableShutdownHooks()` を削除
	out = out.replace(/\s*\w+\.enableShutdownHooks\(\);?\s*\n/g, '\n');

	// 7. `await app.close()` -> disposeAll
	const containerIdents = new Set(['app', 'module', 'c', 'container', 'testingModule']);
	out = out.replace(/await\s+(\w+)\.close\(\)/g, (full, ident) => {
		if (!containerIdents.has(ident)) return full;
		return `await ${ident}.resolve(DisposableRegistry).disposeAll()`;
	});

	// 8. `await app.init()` を削除 (tsyringe container は即座に ready)
	out = out.replace(/^\s*await\s+(?:app|module|container|testingModule)\.init\(\);?\s*\n/gm, '\n');

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
