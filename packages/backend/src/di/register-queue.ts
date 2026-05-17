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

// 旧 QueueModule. 10 種類の BullMQ Queue を `queue:xxx` トークンで登録する。
// `registerGlobals` と同様に process 内 singleton として cache する。
// dispose は SIGTERM 受信時に `disposeQueueClients()` を明示的に呼ぶ。

interface QueueClients {
	system: Bull.Queue;
	endedPollNotification: Bull.Queue;
	postScheduledNote: Bull.Queue;
	deliver: Bull.Queue;
	inbox: Bull.Queue;
	db: Bull.Queue;
	relationship: Bull.Queue;
	objectStorage: Bull.Queue;
	userWebhookDeliver: Bull.Queue;
	systemWebhookDeliver: Bull.Queue;
}

let cached: QueueClients | null = null;

function getQueueClients(config: Config): QueueClients {
	if (cached !== null) return cached;
	cached = {
		system: new Bull.Queue(QUEUE.SYSTEM, baseQueueOptions(config, QUEUE.SYSTEM)),
		endedPollNotification: new Bull.Queue(QUEUE.ENDED_POLL_NOTIFICATION, baseQueueOptions(config, QUEUE.ENDED_POLL_NOTIFICATION)),
		postScheduledNote: new Bull.Queue(QUEUE.POST_SCHEDULED_NOTE, baseQueueOptions(config, QUEUE.POST_SCHEDULED_NOTE)),
		deliver: new Bull.Queue(QUEUE.DELIVER, baseQueueOptions(config, QUEUE.DELIVER)),
		inbox: new Bull.Queue(QUEUE.INBOX, baseQueueOptions(config, QUEUE.INBOX)),
		db: new Bull.Queue(QUEUE.DB, baseQueueOptions(config, QUEUE.DB)),
		relationship: new Bull.Queue(QUEUE.RELATIONSHIP, baseQueueOptions(config, QUEUE.RELATIONSHIP)),
		objectStorage: new Bull.Queue(QUEUE.OBJECT_STORAGE, baseQueueOptions(config, QUEUE.OBJECT_STORAGE)),
		userWebhookDeliver: new Bull.Queue(QUEUE.USER_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.USER_WEBHOOK_DELIVER)),
		systemWebhookDeliver: new Bull.Queue(QUEUE.SYSTEM_WEBHOOK_DELIVER, baseQueueOptions(config, QUEUE.SYSTEM_WEBHOOK_DELIVER)),
	};
	return cached;
}

export function registerQueueClients(c: DependencyContainer): void {
	const config = c.resolve<Config>(DI.config);
	const q = getQueueClients(config);

	c.register('queue:system', { useValue: q.system });
	c.register('queue:endedPollNotification', { useValue: q.endedPollNotification });
	c.register('queue:postScheduledNote', { useValue: q.postScheduledNote });
	c.register('queue:deliver', { useValue: q.deliver });
	c.register('queue:inbox', { useValue: q.inbox });
	c.register('queue:db', { useValue: q.db });
	c.register('queue:relationship', { useValue: q.relationship });
	c.register('queue:objectStorage', { useValue: q.objectStorage });
	c.register('queue:userWebhookDeliver', { useValue: q.userWebhookDeliver });
	c.register('queue:systemWebhookDeliver', { useValue: q.systemWebhookDeliver });
}

// SIGTERM 等で process が終了する時に全 Queue を close する。
export async function disposeQueueClients(): Promise<void> {
	if (cached === null) return;
	const queues = Object.values(cached);
	cached = null;
	await allSettled();
	await Promise.all(queues.map((q) => q.close()));
}
