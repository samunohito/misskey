/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import type { DependencyContainer } from 'tsyringe';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { baseQueueOptions, QUEUE } from '@/queue/const.js';
import { allSettled } from '@/misc/promise-tracker.js';
import type { Disposable } from './disposable-registry.js';
import { DisposableRegistry } from './disposable-registry.js';

// 旧 QueueModule. 10 種類の BullMQ Queue を `queue:xxx` トークンで登録する。
// 起動時に DI.config に基づいて Queue インスタンスを構築し、context container に直接登録する。
// プロセス終了時には DisposableRegistry 経由で全 Queue を close する。
export function registerQueueClients(c: DependencyContainer): void {
	const config = c.resolve<Config>(DI.config);

	const queues: Bull.Queue[] = [];
	const queue = <T extends Bull.Queue>(token: string, q: T): T => {
		c.register(token, { useValue: q });
		queues.push(q);
		return q;
	};

	queue('queue:system', new Bull.Queue(QUEUE.SYSTEM, baseQueueOptions(config, QUEUE.SYSTEM)));
	queue('queue:endedPollNotification', new Bull.Queue(QUEUE.ENDED_POLL_NOTIFICATION, baseQueueOptions(config, QUEUE.ENDED_POLL_NOTIFICATION)));
	queue('queue:postScheduledNote', new Bull.Queue(QUEUE.POST_SCHEDULED_NOTE, baseQueueOptions(config, QUEUE.POST_SCHEDULED_NOTE)));
	queue('queue:deliver', new Bull.Queue(QUEUE.DELIVER, baseQueueOptions(config, QUEUE.DELIVER)));
	queue('queue:inbox', new Bull.Queue(QUEUE.INBOX, baseQueueOptions(config, QUEUE.INBOX)));
	queue('queue:db', new Bull.Queue(QUEUE.DB, baseQueueOptions(config, QUEUE.DB)));
	queue('queue:relationship', new Bull.Queue(QUEUE.RELATIONSHIP, baseQueueOptions(config, QUEUE.RELATIONSHIP)));
	queue('queue:objectStorage', new Bull.Queue(QUEUE.OBJECT_STORAGE, baseQueueOptions(config, QUEUE.OBJECT_STORAGE)));
	queue('queue:userWebhookDeliver', new Bull.Queue(QUEUE.USER_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.USER_WEBHOOK_DELIVER)));
	queue('queue:systemWebhookDeliver', new Bull.Queue(QUEUE.SYSTEM_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.SYSTEM_WEBHOOK_DELIVER)));

	const registry = c.resolve(DisposableRegistry);
	registry.register(new QueueClientsDisposable(queues));
}

class QueueClientsDisposable implements Disposable {
	constructor(private queues: Bull.Queue[]) {}

	async dispose(): Promise<void> {
		await allSettled();
		await Promise.all(this.queues.map((q) => q.close()));
	}
}
