/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { container as globalContainer } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe';
import { DependencyContainerToken } from './container.js';
import { registerGlobals } from './register-globals.js';
import { registerRepositories } from './register-repositories.js';
import { registerCoreServices } from './register-core/index.js';
import { registerQueueClients } from './register-queue.js';
import { registerQueueProcessors } from './register-queue-processors.js';
import { registerDaemonServices } from './register-daemons.js';
import { registerServerServices } from './register-server.js';
import { registerEndpoints } from './register-endpoints.js';
import { registerCliServices } from './register-cli.js';

// 3 つの context container 生成関数。global container には何も登録せず、
// 必ず `createChildContainer()` 経由で新しい container を作る。
// この方式により server / jobQueue / cli が同一プロセスで共存できる
// (`disableClustering: true` 時の master プロセスで両方走るケースに対応)。
//
// 各 register 関数の呼び出し順序は依存関係に従う:
//   globals (config/db/redis/meta) -> repositories -> core -> server/daemons/endpoints/cli/queue

export async function composeServerContainer(): Promise<DependencyContainer> {
	const c = globalContainer.createChildContainer();
	await registerGlobals(c);
	registerRepositories(c);
	registerCoreServices(c);
	registerQueueClients(c);
	registerServerServices(c);
	registerDaemonServices(c);
	registerEndpoints(c);
	c.register(DependencyContainerToken, { useValue: c });
	return c;
}

export async function composeJobQueueContainer(): Promise<DependencyContainer> {
	const c = globalContainer.createChildContainer();
	await registerGlobals(c);
	registerRepositories(c);
	registerCoreServices(c);
	registerQueueClients(c);
	registerQueueProcessors(c);
	c.register(DependencyContainerToken, { useValue: c });
	return c;
}

export async function composeCliContainer(): Promise<DependencyContainer> {
	const c = globalContainer.createChildContainer();
	await registerGlobals(c);
	registerRepositories(c);
	registerCoreServices(c);
	registerQueueClients(c);
	registerCliServices(c);
	c.register(DependencyContainerToken, { useValue: c });
	return c;
}
