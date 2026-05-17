/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { init } from 'slacc';
import type { Config } from '@/config.js';
import type { DependencyContainer } from 'tsyringe';
import { DisposableRegistry } from '@/di/disposable-registry.js';
import { disposeGlobalResources } from '@/di/register-globals.js';
import { disposeQueueClients } from '@/di/register-queue.js';

// 同一プロセス内に server() と jobQueue() が共存する場合があるため、
// container を集めて SIGTERM/SIGINT で一括 disposeAll する。
const activeContainers: DependencyContainer[] = [];

let shutdownHandlerRegistered = false;
let shutdownPromise: Promise<void> | null = null;
function ensureShutdownHandler(): void {
	if (shutdownHandlerRegistered) return;
	shutdownHandlerRegistered = true;

	// SIGTERM と SIGINT が同時に飛んできたり Ctrl+C が連打されたりすると
	// handler が並行実行され、片方が `disposeGlobalResources()` で DataSource を
	// destroy している最中にもう一方の `chart.save()` が走って "Connection terminated"
	// を起こす。最初の呼び出しで生成した Promise を再利用して直列化する。
	const handle = (signal: NodeJS.Signals) => {
		if (shutdownPromise !== null) return shutdownPromise;
		shutdownPromise = (async () => {
			for (const c of [...activeContainers].reverse()) {
				try {
					await c.resolve(DisposableRegistry).disposeAll(signal);
				} catch (e) {
					console.error('[boot] disposeAll failed', e);
				}
			}
			// グローバル resource (DB / Redis / BullMQ Queue) は activeContainers の disposeAll では
			// 破棄しないため、ここで明示的に解放する。
			try {
				await disposeQueueClients();
			} catch (e) {
				console.error('[boot] disposeQueueClients failed', e);
			}
			try {
				await disposeGlobalResources();
			} catch (e) {
				console.error('[boot] disposeGlobalResources failed', e);
			}
			process.exit(0);
		})();
		return shutdownPromise;
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
