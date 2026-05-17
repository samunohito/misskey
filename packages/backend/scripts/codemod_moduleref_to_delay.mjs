/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * `ModuleRef.get(...)` + `onModuleInit` 経由の循環解決を `@inject(delay(() => X))` に書き換える codemod.
 *
 * 対応する典型パターン (UserEntityService 風):
 *
 *   @injectable()
 *   export class UserEntityService implements OnModuleInit {
 *       private apPersonService: ApPersonService;
 *       constructor(private moduleRef: ModuleRef, @inject(DI.config) private config: Config) {}
 *       onModuleInit() {
 *           this.apPersonService = this.moduleRef.get('ApPersonService');
 *       }
 *   }
 *
 * 変換後:
 *
 *   @injectable()
 *   export class UserEntityService {
 *       constructor(
 *           @inject(delay(() => ApPersonService)) private apPersonService: ApPersonService,
 *           @inject(DI.config) private config: Config,
 *       ) {}
 *   }
 *
 * 触らない:
 *  - ApiServerService.moduleRef.get('ep:' + name, {strict: false}) のような動的解決
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

// `constructor(` 直後から、対応する `)` までを括弧深さで探す
function findConstructorRange(source) {
	const m = source.match(/constructor\s*\(/);
	if (!m) return null;
	const openIdx = m.index + m[0].length - 1; // '(' の位置
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
	return { openIdx, closeIdx: i }; // closeIdx は対応する ')' の位置
}

function transform(filePath, source) {
	const onModuleInitMatch = source.match(/onModuleInit\(\)\s*(?::\s*[\w<>|& ]+)?\s*\{[^]*?\n\t\}/);
	if (!onModuleInitMatch) return null;
	const body = onModuleInitMatch[0];

	const assignments = [...body.matchAll(
		/this\.(\w+)\s*=\s*this\.moduleRef\.get\(\s*(?:'(\w+)'|(\w+)\.name)(?:\s*,\s*\{[^}]*\})?\s*\)/g,
	)];
	if (assignments.length === 0) return null;

	const dependencies = assignments.map((m) => {
		const fieldName = m[1];
		const className = m[2] ?? m[3];
		return { fieldName, className };
	});

	let out = source;

	// 1. 既存の field 宣言 `private apPersonService: ApPersonService;` を削除
	for (const dep of dependencies) {
		const re = new RegExp(`^\\s*private\\s+${dep.fieldName}\\s*:\\s*${dep.className}\\s*;\\s*\\n`, 'm');
		out = out.replace(re, '');
	}

	// 2. constructor の正確な範囲を取り直す (field 削除後の再走査)
	const range = findConstructorRange(out);
	if (!range) return null;

	// 2a. constructor の中身を抽出して `private moduleRef: ModuleRef,?` を除く
	const inside = out.slice(range.openIdx + 1, range.closeIdx);
	const withoutModuleRef = inside.replace(/\s*private\s+moduleRef\s*:\s*ModuleRef\s*,?\s*/g, '');

	// 3. 新しい @inject(delay(...)) 群を生成して末尾に追加
	const trimmed = withoutModuleRef.replace(/\s+$/, '');
	const trailingComma = trimmed.length === 0 || trimmed.endsWith(',') ? '' : ',';

	const newLines = dependencies.map((dep) => `\t\t@inject(delay(() => ${dep.className})) private ${dep.fieldName}: ${dep.className},`);
	const newInside = `${trimmed}${trailingComma}\n${newLines.join('\n')}\n\t`;
	out = out.slice(0, range.openIdx + 1) + newInside + out.slice(range.closeIdx);

	// 4. `onModuleInit` メソッドブロックを丸ごと削除 (戻り型 `: void` 等を許容)
	out = out.replace(/\n\t(?:async\s+)?onModuleInit\(\)\s*(?::\s*[\w<>|& ]+)?\s*\{[^]*?\n\t\}\n/, '\n');

	// 5. `implements OnModuleInit` を削除
	out = out.replace(/\s*implements\s+([\w,\s]*)\bOnModuleInit\b(\s*,\s*)?/, (_match, before) => {
		const remaining = before.replace(/,\s*$/, '').trim();
		if (!remaining) return '';
		return ` implements ${remaining}`;
	});

	// 6. `import { ModuleRef } from '@nestjs/core'` を整形して ModuleRef を除く
	out = out.replace(/^(\s*import\s+\{)([^}]+)(\}\s+from\s+'@nestjs\/core';?\s*\n)/gm, (full, head, body, tail) => {
		const names = body.split(',').map(s => s.trim()).filter(Boolean);
		const filtered = names.filter(n => n !== 'ModuleRef' && n !== 'ContextIdFactory');
		if (filtered.length === names.length) return full;
		if (filtered.length === 0) return '';
		return `${head} ${filtered.join(', ')} ${tail}`;
	});

	// 7. `import ... { OnModuleInit ... } from '@nestjs/common'` から OnModuleInit を除く
	out = out.replace(/^(\s*import\s+(?:type\s+)?\{)([^}]+)(\}\s+from\s+'@nestjs\/common';?\s*\n)/gm, (full, head, body, tail) => {
		const names = body.split(',').map(s => s.trim()).filter(Boolean);
		const filtered = names.filter(n => n !== 'OnModuleInit' && n !== 'type OnModuleInit');
		if (filtered.length === names.length) return full;
		if (filtered.length === 0) return '';
		return `${head} ${filtered.join(', ')} ${tail}`;
	});

	// 8. tsyringe import 行に `delay` を追加
	if (/^\s*import\s+\{[^}]+\}\s+from\s+'tsyringe';?\s*\n/m.test(out)) {
		out = out.replace(/^(\s*import\s+\{)([^}]+)(\}\s+from\s+'tsyringe';?\s*\n)/m, (full, head, body, tail) => {
			const set = new Set(body.split(',').map(s => s.trim()).filter(Boolean));
			set.add('delay');
			return `${head} ${[...set].sort().join(', ')} ${tail}`;
		});
	}

	// 9. delay() で参照するクラスが `import type { X }` で取り込まれている場合、
	//    value import に格上げする (循環解決のため、value import + delay() の組み合わせは正当)。
	for (const dep of dependencies) {
		const typeImportRe = new RegExp(`^(\\s*import\\s+type\\s+\\{[^}]*\\b)${dep.className}(\\b[^}]*\\})(\\s+from\\s+'[^']+';?\\s*\\n)`, 'm');
		const matchTypeImport = out.match(typeImportRe);
		if (matchTypeImport) {
			// 該当行に複数の名前が並んでいる場合は分割: type-only から該当のみを値 import に移す。
			const fullLine = matchTypeImport[0];
			const headRest = matchTypeImport[1] + matchTypeImport[2];
			const tail = matchTypeImport[3];
			const inside = (matchTypeImport[1].match(/\{(.+)/)?.[1] ?? '') + dep.className + matchTypeImport[2].replace(/\}/, '');
			const allNames = inside.split(',').map(s => s.trim()).filter(Boolean);
			const otherTypeNames = allNames.filter(n => n !== dep.className);
			const fromPath = tail.match(/from\s+'([^']+)'/)[1];
			let replacement = '';
			if (otherTypeNames.length > 0) {
				replacement = `import type { ${otherTypeNames.join(', ')} } from '${fromPath}';\n`;
			}
			replacement += `import { ${dep.className} } from '${fromPath}';\n`;
			out = out.replace(fullLine, replacement);
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
