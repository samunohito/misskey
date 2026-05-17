/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { init } from 'slacc';
import type { Config } from '@/config.js';
import type { DependencyContainer } from 'tsyringe';
import { DisposableRegistry } from '@/di/disposable-registry.js';
import { disposeGlobalResources } from '@/di/register-globals.js';

// 同一プロセス内に server() と jobQueue() が共存する場合があるため、
// container を集めて SIGTERM/SIGINT で一括 disposeAll する。
const activeContainers: DependencyContainer[] = [];

let shutdownHandlerRegistered = false;
function ensureShutdownHandler(): void {
	if (shutdownHandlerRegistered) return;
	shutdownHandlerRegistered = true;
	const handle = async (signal: NodeJS.Signals) => {
		for (const c of [...activeContainers].reverse()) {
			try {
				await c.resolve(DisposableRegistry).disposeAll(signal);
			} catch (e) {
				console.error('[boot] disposeAll failed', e);
			}
		}
		// グローバル resource (DB / Redis) は activeContainers の disposeAll では破棄しないため、
		// ここで明示的に解放する。
		try {
			await disposeGlobalResources();
		} catch (e) {
			console.error('[boot] disposeGlobalResources failed', e);
		}
		process.exit(0);
	};
	process.on('SIGTERM', handle);
	process.on('SIGINT', handle);
}

let slaccInitialized = false;

export function initExtraThreadPool(config: Config) {
	if (slaccInitialized) return;

	const threadPoolSize = Math.max(config.threadPoolSize ?? 1, 1);

	init(threadPoolSize);

	slaccInitialized = true;
}

export async function server(): Promise<DependencyContainer> {
	const { composeServerContainer } = await import('@/di/compose.js');
	const { ServerService } = await import('@/server/ServerService.js');

	const container = await composeServerContainer();
	activeContainers.push(container);
	ensureShutdownHandler();

	const serverService = container.resolve(ServerService);
	await serverService.launch();

	if (process.env.NODE_ENV !== 'test') {
		const { ChartManagementService } = await import('@/core/chart/ChartManagementService.js');
		const { QueueStatsService } = await import('@/daemons/QueueStatsService.js');
		const { ServerStatsService } = await import('@/daemons/ServerStatsService.js');

		container.resolve(ChartManagementService).start();
		container.resolve(QueueStatsService).start();
		container.resolve(ServerStatsService).start();
	}

	return container;
}

export async function jobQueue(): Promise<DependencyContainer> {
	const { composeJobQueueContainer } = await import('@/di/compose.js');
	const { QueueProcessorService } = await import('@/queue/QueueProcessorService.js');
	const { ChartManagementService } = await import('@/core/chart/ChartManagementService.js');

	const container = await composeJobQueueContainer();
	activeContainers.push(container);
	ensureShutdownHandler();

	container.resolve(QueueProcessorService).start();
	container.resolve(ChartManagementService).start();

	return container;
}
