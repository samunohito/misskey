/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';

import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import { QueueProcessorService } from '@/queue/QueueProcessorService.js';
import { DeliverProcessorService } from '@/queue/processors/DeliverProcessorService.js';
import { EndedPollNotificationProcessorService } from '@/queue/processors/EndedPollNotificationProcessorService.js';
import { PostScheduledNoteProcessorService } from '@/queue/processors/PostScheduledNoteProcessorService.js';
import { InboxProcessorService } from '@/queue/processors/InboxProcessorService.js';
import { UserWebhookDeliverProcessorService } from '@/queue/processors/UserWebhookDeliverProcessorService.js';
import { SystemWebhookDeliverProcessorService } from '@/queue/processors/SystemWebhookDeliverProcessorService.js';
import { CheckExpiredMutingsProcessorService } from '@/queue/processors/CheckExpiredMutingsProcessorService.js';
import { BakeBufferedReactionsProcessorService } from '@/queue/processors/BakeBufferedReactionsProcessorService.js';
import { CleanChartsProcessorService } from '@/queue/processors/CleanChartsProcessorService.js';
import { CleanProcessorService } from '@/queue/processors/CleanProcessorService.js';
import { CheckModeratorsActivityProcessorService } from '@/queue/processors/CheckModeratorsActivityProcessorService.js';
import { CleanRemoteNotesProcessorService } from '@/queue/processors/CleanRemoteNotesProcessorService.js';
import { CleanRemoteFilesProcessorService } from '@/queue/processors/CleanRemoteFilesProcessorService.js';
import { DeleteAccountProcessorService } from '@/queue/processors/DeleteAccountProcessorService.js';
import { DeleteDriveFilesProcessorService } from '@/queue/processors/DeleteDriveFilesProcessorService.js';
import { DeleteFileProcessorService } from '@/queue/processors/DeleteFileProcessorService.js';
import { ExportBlockingProcessorService } from '@/queue/processors/ExportBlockingProcessorService.js';
import { ExportCustomEmojisProcessorService } from '@/queue/processors/ExportCustomEmojisProcessorService.js';
import { ExportFollowingProcessorService } from '@/queue/processors/ExportFollowingProcessorService.js';
import { ExportMutingProcessorService } from '@/queue/processors/ExportMutingProcessorService.js';
import { ExportNotesProcessorService } from '@/queue/processors/ExportNotesProcessorService.js';
import { ExportClipsProcessorService } from '@/queue/processors/ExportClipsProcessorService.js';
import { ExportUserListsProcessorService } from '@/queue/processors/ExportUserListsProcessorService.js';
import { ExportAntennasProcessorService } from '@/queue/processors/ExportAntennasProcessorService.js';
import { ImportBlockingProcessorService } from '@/queue/processors/ImportBlockingProcessorService.js';
import { ImportCustomEmojisProcessorService } from '@/queue/processors/ImportCustomEmojisProcessorService.js';
import { ImportFollowingProcessorService } from '@/queue/processors/ImportFollowingProcessorService.js';
import { ImportMutingProcessorService } from '@/queue/processors/ImportMutingProcessorService.js';
import { ImportUserListsProcessorService } from '@/queue/processors/ImportUserListsProcessorService.js';
import { ImportAntennasProcessorService } from '@/queue/processors/ImportAntennasProcessorService.js';
import { ResyncChartsProcessorService } from '@/queue/processors/ResyncChartsProcessorService.js';
import { TickChartsProcessorService } from '@/queue/processors/TickChartsProcessorService.js';
import { AggregateRetentionProcessorService } from '@/queue/processors/AggregateRetentionProcessorService.js';
import { ExportFavoritesProcessorService } from '@/queue/processors/ExportFavoritesProcessorService.js';
import { RelationshipProcessorService } from '@/queue/processors/RelationshipProcessorService.js';

export function registerQueueProcessors(c: DependencyContainer): void {
	const classes: Array<new (...args: never[]) => unknown> = [
		QueueLoggerService,
		TickChartsProcessorService,
		ResyncChartsProcessorService,
		CleanChartsProcessorService,
		CheckExpiredMutingsProcessorService,
		BakeBufferedReactionsProcessorService,
		CleanProcessorService,
		DeleteDriveFilesProcessorService,
		ExportCustomEmojisProcessorService,
		ExportNotesProcessorService,
		ExportClipsProcessorService,
		ExportFavoritesProcessorService,
		ExportFollowingProcessorService,
		ExportMutingProcessorService,
		ExportBlockingProcessorService,
		ExportUserListsProcessorService,
		ExportAntennasProcessorService,
		ImportFollowingProcessorService,
		ImportMutingProcessorService,
		ImportBlockingProcessorService,
		ImportUserListsProcessorService,
		ImportCustomEmojisProcessorService,
		ImportAntennasProcessorService,
		DeleteAccountProcessorService,
		DeleteFileProcessorService,
		CleanRemoteFilesProcessorService,
		RelationshipProcessorService,
		UserWebhookDeliverProcessorService,
		SystemWebhookDeliverProcessorService,
		EndedPollNotificationProcessorService,
		PostScheduledNoteProcessorService,
		DeliverProcessorService,
		InboxProcessorService,
		AggregateRetentionProcessorService,
		CheckModeratorsActivityProcessorService,
		CleanRemoteNotesProcessorService,
		QueueProcessorService,
	];

	for (const cls of classes) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		c.registerSingleton(cls as any);
	}
}
