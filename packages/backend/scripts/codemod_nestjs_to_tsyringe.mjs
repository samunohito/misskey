/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * NestJS to tsyringe codemod (machine-safe portion only).
 *
 * 安全な置換だけを行う:
 *  - import 文の整形 (@nestjs/common -> tsyringe)
 *  - @Injectable() -> @injectable()
 *  - @Injectable({ scope: Scope.TRANSIENT }) -> @injectable()
 *  - @Inject(token) -> @inject(token)
 *  - forwardRef(() => X) -> delay(() => X)
 *
 * 以下は触らない (手動 or 専用ステップで処理):
 *  - OnApplicationShutdown / OnModuleInit 実装クラス
 *  - ModuleRef.get(...) / ContextIdFactory / REQUEST
 *  - @Module({...}) クラス自体
 *  - NestFactory.createApplicationContext(...)
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

function parseNestImports(source) {
	const result = [];
	const re = /^\s*import\s+(type\s+)?\{([^}]+)\}\s+from\s+'@nestjs\/common';?\s*\n/gm;
	let m;
	while ((m = re.exec(source)) !== null) {
		result.push({
			fullMatch: m[0],
			isType: !!m[1],
			names: m[2].split(',').map(s => s.trim()).filter(Boolean),
			index: m.index,
		});
	}
	return result;
}

function transform(filePath, source) {
	const nestImports = parseNestImports(source);
	if (nestImports.length === 0) return null;

	let out = source;
	let changed = false;
	const unhandled = new Set();

	const tsyringeSymbols = new Set();
	const keepTypeOnly = new Set();

	for (const imp of [...nestImports].reverse()) {
		const remaining = [];
		for (const name of imp.names) {
			const rawName = name.replace(/^type\s+/, '');
			switch (rawName) {
				case 'Injectable':
					tsyringeSymbols.add('injectable');
					break;
				case 'Inject':
					tsyringeSymbols.add('inject');
					break;
				case 'forwardRef':
					tsyringeSymbols.add('delay');
					break;
				case 'Module':
				case 'Global':
				case 'Provider':
				case 'Scope':
				case 'OnApplicationShutdown':
				case 'OnModuleInit':
				case 'LoggerService':
					if (rawName === 'OnApplicationShutdown' || rawName === 'OnModuleInit' || rawName === 'Provider' || rawName === 'LoggerService') {
						keepTypeOnly.add(rawName);
					}
					unhandled.add(rawName);
					break;
				default:
					remaining.push(name);
					unhandled.add(rawName);
			}
		}

		let replacement = '';
		if (remaining.length > 0) {
			const prefix = imp.isType ? 'import type ' : 'import ';
			replacement = `${prefix}{ ${remaining.join(', ')} } from '@nestjs/common';\n`;
		}
		out = out.slice(0, imp.index) + replacement + out.slice(imp.index + imp.fullMatch.length);
		changed = true;
	}

	out = out.replace(/@Injectable\(\s*\{[^}]*\}\s*\)/g, (match) => {
		if (/Scope\.TRANSIENT/.test(match)) unhandled.add('Scope.TRANSIENT');
		changed = true;
		return '@injectable()';
	});
	out = out.replace(/@Injectable\(\)/g, () => { changed = true; return '@injectable()'; });

	out = out.replace(/@Inject\(/g, () => { changed = true; return '@inject('; });

	out = out.replace(/\bforwardRef\(/g, () => {
		changed = true;
		tsyringeSymbols.add('delay');
		return 'delay(';
	});

	if (tsyringeSymbols.size > 0 && !/^\s*import\s+\{[^}]*\}\s+from\s+'tsyringe'/m.test(out)) {
		const symbols = [...tsyringeSymbols].sort().join(', ');
		const headerEnd = out.indexOf('*/\n');
		if (headerEnd !== -1) {
			const insertAt = headerEnd + 3;
			out = out.slice(0, insertAt) + `\nimport { ${symbols} } from 'tsyringe';\n` + out.slice(insertAt);
		} else {
			out = `import { ${symbols} } from 'tsyringe';\n` + out;
		}
		changed = true;
	} else if (tsyringeSymbols.size > 0) {
		out = out.replace(/^\s*import\s+\{([^}]+)\}\s+from\s+'tsyringe';?\s*\n/m, (full, body) => {
			const have = new Set(body.split(',').map(s => s.trim()));
			for (const s of tsyringeSymbols) have.add(s);
			const merged = [...have].sort().join(', ');
			return `import { ${merged} } from 'tsyringe';\n`;
		});
	}

	if (keepTypeOnly.size > 0) {
		const typeNames = [...keepTypeOnly].sort().join(', ');
		if (!new RegExp(`^\\s*import\\s+type\\s+\\{[^}]*\\b(${[...keepTypeOnly].join('|')})\\b[^}]*\\}\\s+from\\s+'@nestjs/common';?`, 'm').test(out)) {
			const tsyringeImportRe = /^(\s*import\s+\{[^}]+\}\s+from\s+'tsyringe';?\s*\n)/m;
			if (tsyringeImportRe.test(out)) {
				out = out.replace(tsyringeImportRe, `$1import type { ${typeNames} } from '@nestjs/common';\n`);
			}
		}
	}

	if (!changed) return null;
	return { source: out, unhandled };
}

function main() {
	const files = walk(root);
	let written = 0;
	const unhandledTally = new Map();

	for (const f of files) {
		const src = fs.readFileSync(f, 'utf8');
		const r = transform(f, src);
		if (!r) continue;
		fs.writeFileSync(f, r.source);
		written++;
		for (const u of r.unhandled) {
			unhandledTally.set(u, (unhandledTally.get(u) ?? 0) + 1);
		}
	}

	console.log(`codemod: ${written} files modified`);
	if (unhandledTally.size > 0) {
		console.log('unhandled NestJS symbols (manual follow-up needed):');
		for (const [k, v] of [...unhandledTally.entries()].sort((a, b) => b[1] - a[1])) {
			console.log(`  ${k}: ${v}`);
		}
	}
}

main();
