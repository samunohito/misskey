/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * REQUEST 専用 codemod: `@inject(REQUEST)` -> `@inject(RequestToken)`.
 * 対象は WebSocket Connection / Channel 系のみ (ModuleRef は手動)。
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

function transform(filePath, source) {
	if (!source.includes('REQUEST')) return null;

	let out = source;
	let changed = false;

	// `@inject(REQUEST)` -> `@inject(RequestToken)`
	out = out.replace(/@inject\(REQUEST\)/g, () => { changed = true; return '@inject(RequestToken)'; });
	if (!changed) return null;

	// import 行から REQUEST を除き、`RequestToken` を import する
	// `import { ..., REQUEST, ... } from '@nestjs/core'` を整形
	out = out.replace(/^(\s*import\s+\{)([^}]+)(\}\s+from\s+'@nestjs\/core';?)\s*\n/gm, (full, head, body, tail) => {
		const names = body.split(',').map(s => s.trim()).filter(Boolean);
		const filtered = names.filter(n => n !== 'REQUEST');
		if (filtered.length === names.length) return full; // REQUEST が無ければそのまま
		if (filtered.length === 0) return ''; // この行は削除
		return `${head} ${filtered.join(', ')} ${tail}\n`;
	});

	// RequestToken の import を追加 (既に無ければ)
	if (!/RequestToken/.test(out.match(/^\s*import\s+\{[^}]*\}\s+from\s+'@\/di\/container\.js'/m)?.[0] ?? '')) {
		// `@/di/container` から既に何か import している場合は merge する
		if (/^\s*import\s+\{([^}]+)\}\s+from\s+'@\/di\/container\.js';?\s*\n/m.test(out)) {
			out = out.replace(/^(\s*import\s+\{)([^}]+)(\}\s+from\s+'@\/di\/container\.js';?\s*\n)/m, (_full, head, body, tail) => {
				const set = new Set(body.split(',').map(s => s.trim()).filter(Boolean));
				set.add('RequestToken');
				return `${head} ${[...set].sort().join(', ')} ${tail}`;
			});
		} else {
			// tsyringe import 行の直後に追加
			const tsyringeImportRe = /^(\s*import\s+\{[^}]+\}\s+from\s+'tsyringe';?\s*\n)/m;
			if (tsyringeImportRe.test(out)) {
				out = out.replace(tsyringeImportRe, `$1import { RequestToken } from '@/di/container.js';\n`);
			} else {
				// SPDX header の後ろに挿入
				const headerEnd = out.indexOf('*/\n');
				if (headerEnd !== -1) {
					out = out.slice(0, headerEnd + 3) + `\nimport { RequestToken } from '@/di/container.js';\n` + out.slice(headerEnd + 3);
				}
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
		if (r === null) continue;
		fs.writeFileSync(f, r);
		written++;
	}
	console.log(`codemod: ${written} files modified`);
}

main();
