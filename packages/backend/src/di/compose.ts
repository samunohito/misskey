/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { container as globalContainer } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe';
import { DependencyContainerToken } from './container.js';
import { registerGlobals } from './register-globals.js';

// 3 つの context container 生成関数。global container には何も登録せず、
// 必ず `createChildContainer()` 経由で新しい container を作る。
// この方式により server / jobQueue / cli が同一プロセスで共存できる
// (`disableClustering: true` 時の master プロセスで両方走るケースに対応)。

export async function composeServerContainer(): Promise<DependencyContainer> {
	const c = globalContainer.createChildContainer();
	await registerGlobals(c);
	// TODO(nest->tsyringe): registerRepositories, registerCore, registerServer, registerDaemons, registerEndpoints をここに追加していく
	c.register(DependencyContainerToken, { useValue: c });
	return c;
}

export async function composeJobQueueContainer(): Promise<DependencyContainer> {
	const c = globalContainer.createChildContainer();
	await registerGlobals(c);
	// TODO(nest->tsyringe): registerRepositories, registerCore, registerQueueProcessors をここに追加していく
	c.register(DependencyContainerToken, { useValue: c });
	return c;
}

export async function composeCliContainer(): Promise<DependencyContainer> {
	const c = globalContainer.createChildContainer();
	await registerGlobals(c);
	// TODO(nest->tsyringe): registerRepositories, registerCore, registerCli をここに追加していく
	c.register(DependencyContainerToken, { useValue: c });
	return c;
}
