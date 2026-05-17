/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// tsyringe は reflect-metadata polyfill を必要とする (各 worker プロセス起動時に一度だけ load する)。
// boot/entry.ts は test では走らないので、ここで明示的に import する。
import 'reflect-metadata';

export default function setup() {
	// DBはUTC（っぽい）ので、テスト側も合わせておく
	process.env.TZ = 'UTC';
	process.env.NODE_ENV = 'test';
}
