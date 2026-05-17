/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { container as globalContainer } from 'tsyringe';
import type { DependencyContainer, InjectionToken } from 'tsyringe';
import { DependencyContainerToken } from './container.js';
import { DisposableRegistry } from './disposable-registry.js';

export interface CreateTestContainerOptions {
	// 旧 `imports: [GlobalModule]` 相当: 設定/DB/Redis/Meta を実環境向けに初期化する。
	// 既定は false (タイト mock を期待するテスト向け)。
	loadGlobals?: boolean;
	// 旧 `imports: [RepositoryModule]` 相当: 75 個の repository を全部登録する。
	// 既定は false。`loadGlobals: true` 前提。
	loadRepositories?: boolean;
	// 任意の追加登録 (テスト固有の Singleton 等)。
	// fluent API (`c.registerSingleton(X)` の戻り値が container) も許容するため `unknown` を返り型に取る。
	register?: (c: DependencyContainer) => unknown | Promise<unknown>;
	// `useValue` でモックを差し込みたい token とその値のペア配列
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mocks?: Array<[InjectionToken<any>, unknown]>;
}

// テスト用 container を作る。旧 `@nestjs/testing` の `Test.createTestingModule().overrideProvider().compile()` 相当。
// テスト本体では `c.resolve(TargetService)` で取得し、`afterAll` で `c.resolve(DisposableRegistry).disposeAll()` を呼ぶこと。
export async function createTestContainer(opts: CreateTestContainerOptions = {}): Promise<DependencyContainer> {
	const c = globalContainer.createChildContainer();
	c.registerSingleton(DisposableRegistry);
	c.register(DependencyContainerToken, { useValue: c });

	if (opts.loadGlobals) {
		const { registerGlobals } = await import('./register-globals.js');
		await registerGlobals(c);
	}
	if (opts.loadRepositories) {
		const { registerRepositories } = await import('./register-repositories.js');
		registerRepositories(c);
	}

	await opts.register?.(c);

	for (const [tok, val] of opts.mocks ?? []) {
		c.register(tok, { useValue: val });
	}

	return c;
}
