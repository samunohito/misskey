/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';
import { QueueStatsService } from '@/daemons/QueueStatsService.js';
import { ServerStatsService } from '@/daemons/ServerStatsService.js';

export function registerDaemonServices(c: DependencyContainer): void {
	c.registerSingleton(QueueStatsService);
	c.registerSingleton(ServerStatsService);
}
