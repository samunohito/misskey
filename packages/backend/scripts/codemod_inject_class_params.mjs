/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * `@injectable()` class の constructor で class-typed parameter (DI.symbol でない、
 * かつ既に @inject() が付いていないもの) に `@inject(delay(() => X))` を追加する codemod.
 *
 * ESM の bundle で `let X = class X {...}` の評価順序により、後で declared な class への
 * 参照が paramtype emit 時に TDZ になり、`design:paramtypes` 配列の該当位置が `Object` に erase される。
 * tsyringe は `resolve(Object)` を試みて "TypeInfo not known for Object" で失敗する。
 *
 * `@inject(delay(() => X))` は decorator 評価時には X を読まず resolve 時に解決するため、
 * paramtype に依存せず token として正しい class を参照できる。
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
	return { paramsOpen: openIdx, paramsClose: i };
}

function splitTopLevel(s) {
	const items = [];
	let depth = 0;
	let buf = '';
	for (const ch of s) {
		if ('<([{'.includes(ch)) depth++;
		else if ('>)]}'.includes(ch)) depth--;
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
	if (!/@injectable\(\)/.test(source)) return null;

	let out = source;
	let needsDelay = false;
	let mutated = false;

	const injectableRe = /@injectable\(\)/g;
	const positions = [];
	let match;
	while ((match = injectableRe.exec(out)) !== null) {
		positions.push(match.index);
	}
	for (const pos of positions.reverse()) {
		const range = findConstructorRange(out, pos);
		if (!range) continue;

		const params = out.slice(range.paramsOpen + 1, range.paramsClose);
		const items = splitTopLevel(params);
		const newItems = items.map((rawItem) => {
			const item = rawItem.replace(/^\s+|\s+$/g, '');
			if (!item) return rawItem;
			if (/@inject\s*\(/.test(item)) return rawItem;

			const re = /^(\s*)((?:private|protected|public|readonly)(?:\s+(?:private|protected|public|readonly))*\s+)?(\w+)\s*:\s*([\w.]+)\s*$/;
			const pm = item.match(re);
			if (!pm) return rawItem;

			const indent = pm[1];
			const modifiers = pm[2] ?? '';
			const fieldName = pm[3];
			const typeName = pm[4];

			if (!/^[A-Z]/.test(typeName)) return rawItem;
			if (['String', 'Number', 'Boolean', 'Symbol', 'Object', 'Array', 'Date', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Function'].includes(typeName)) return rawItem;
			if (/\[/.test(typeName)) return rawItem;

			needsDelay = true;
			mutated = true;
			return `${indent}@inject(delay(() => ${typeName})) ${modifiers}${fieldName}: ${typeName}`;
		});

		if (newItems.join(',') !== items.join(',')) {
			const newParams = newItems.join(',');
			out = out.slice(0, range.paramsOpen + 1) + newParams + out.slice(range.paramsClose);
		}
	}

	if (!mutated) return null;

	if (needsDelay && /from\s+'tsyringe'/.test(out)) {
		out = out.replace(/^(\s*import\s+\{)([^}]+)(\}\s+from\s+'tsyringe';?\s*\n)/m, (full, head, body, tail) => {
			const set = new Set(body.split(',').map(s => s.trim()).filter(Boolean));
			set.add('delay');
			set.add('inject');
			return `${head} ${[...set].sort().join(', ')} ${tail}`;
		});
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
	}
	console.log(`codemod: ${written} files modified`);
}

main();
