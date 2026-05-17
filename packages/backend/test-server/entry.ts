/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// このファイルは reflect-metadata polyfill を確実に最初に走らせるための薄い wrapper。
// rolldown は ESM static import を依存解決の都合で並べ替えるため、副作用 import の
// `import 'reflect-metadata'` が tsyringe デコレータを含む chunk より後ろに置かれる
// ケースがある (built-test/entry.js の chunk import が先に評価されて
// `tsyringe requires a reflect polyfill` で落ちる)。
// ここでは polyfill を static、本体を dynamic にすることで順序を強制する。
import 'reflect-metadata';

const impl = await import('./entry-impl.js');

export const setup = impl.setup;
export const teardown = impl.teardown;
