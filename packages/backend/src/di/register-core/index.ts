/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';
import { registerCoreSingletonServices } from './services.js';
import { registerEntityServices } from './entities.js';
import { registerActivityPubServices } from './activitypub.js';
import { registerChartServices } from './chart.js';

// 旧 CoreModule の置換。`registerCoreServices(c)` 1 つで CoreModule 配下の
// 全プロバイダを context container に登録する。
//
// 必ず `registerGlobals(c)` → `registerRepositories(c)` の後に呼ぶこと
// (各 service が DI.config / DI.db / repositories に依存するため)。
//
// 旧 CoreModule にあった `$XxxService` (string-token via `useExisting`) は廃止。
// 旧 `moduleRef.get('XxxService')` 経由の参照は `@inject(delay(() => XxxService))`
// (lazyInject) に置換される (ステップ 8 で実施)。
export function registerCoreServices(c: DependencyContainer): void {
	registerCoreSingletonServices(c);
	registerEntityServices(c);
	registerActivityPubServices(c);
	registerChartServices(c);
}
