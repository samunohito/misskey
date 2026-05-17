/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { init } from 'slacc';
import type { Config } from '@/config.js';
import type { DependencyContainer } from 'tsyringe';

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

	container.resolve(QueueProcessorService).start();
	container.resolve(ChartManagementService).start();

	return container;
}
