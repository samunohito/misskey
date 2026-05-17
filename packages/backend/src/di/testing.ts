/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { container as globalContainer } from 'tsyringe';
import type { DependencyContainer, InjectionToken } from 'tsyringe';
import { DependencyContainerToken } from './container.js';
import { DisposableRegistry } from './disposable-registry.js';

export interface CreateTestContainerOptions {
	// 任意の追加登録 (テスト固有の Singleton 等)
	register?: (c: DependencyContainer) => void | Promise<void>;
	// `useValue` でモックを差し込みたい token とその値のペア配列
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mocks?: Array<[InjectionToken<any>, unknown]>;
}

// テスト用 container を作る。`@nestjs/testing` の `Test.createTestingModule().overrideProvider().compile()` 相当。
// テスト本体では `c.resolve(TargetService)` で取得し、`afterAll` で `c.resolve(DisposableRegistry).disposeAll()` を呼ぶこと。
export async function createTestContainer(opts: CreateTestContainerOptions = {}): Promise<DependencyContainer> {
	const c = globalContainer.createChildContainer();
	c.registerSingleton(DisposableRegistry);
	c.register(DependencyContainerToken, { useValue: c });

	await opts.register?.(c);

	for (const [tok, val] of opts.mocks ?? []) {
		c.register(tok, { useValue: val });
	}

	return c;
}
