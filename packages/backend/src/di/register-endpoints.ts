/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Lifecycle } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe';
import * as endpointsObject from '@/server/api/endpoint-list.js';

// 旧 EndpointsModule. 全 API エンドポイントクラスを `ep:${name}` トークンで登録する。
// `ApiServerService` 起動時に `container.resolve<any>(`ep:${endpoint.name}`)` で動的に取得する。
export function registerEndpoints(c: DependencyContainer): void {
	for (const [name, ep] of Object.entries(endpointsObject)) {
		c.register(
			`ep:${name}`,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			{ useClass: (ep as { default: new (...args: never[]) => unknown }).default as any },
			{ lifecycle: Lifecycle.Singleton },
		);
	}
}
