/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject } from 'tsyringe';

// `@inject(delay(() => X))` の薄いラッパ。Proxy で循環を解く。
// 使用箇所では `import type` でクラス型を借り、値参照は `import * as` で別取りすると ESM 循環を回避できる。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyInject<T>(getCtor: () => new (...args: any[]) => T): ParameterDecorator {
	return inject(delay(getCtor)) as ParameterDecorator;
}
