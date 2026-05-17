/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';

import { AbuseUserReportEntityService } from '@/core/entities/AbuseUserReportEntityService.js';
import { AbuseReportNotificationRecipientEntityService } from '@/core/entities/AbuseReportNotificationRecipientEntityService.js';
import { AnnouncementEntityService } from '@/core/entities/AnnouncementEntityService.js';
import { AntennaEntityService } from '@/core/entities/AntennaEntityService.js';
import { AppEntityService } from '@/core/entities/AppEntityService.js';
import { AuthSessionEntityService } from '@/core/entities/AuthSessionEntityService.js';
import { BlockingEntityService } from '@/core/entities/BlockingEntityService.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ClipEntityService } from '@/core/entities/ClipEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
import { FollowingEntityService } from '@/core/entities/FollowingEntityService.js';
import { FollowRequestEntityService } from '@/core/entities/FollowRequestEntityService.js';
import { GalleryLikeEntityService } from '@/core/entities/GalleryLikeEntityService.js';
import { GalleryPostEntityService } from '@/core/entities/GalleryPostEntityService.js';
import { HashtagEntityService } from '@/core/entities/HashtagEntityService.js';
import { InstanceEntityService } from '@/core/entities/InstanceEntityService.js';
import { InviteCodeEntityService } from '@/core/entities/InviteCodeEntityService.js';
import { ModerationLogEntityService } from '@/core/entities/ModerationLogEntityService.js';
import { MutingEntityService } from '@/core/entities/MutingEntityService.js';
import { RenoteMutingEntityService } from '@/core/entities/RenoteMutingEntityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NoteFavoriteEntityService } from '@/core/entities/NoteFavoriteEntityService.js';
import { NoteReactionEntityService } from '@/core/entities/NoteReactionEntityService.js';
import { NoteDraftEntityService } from '@/core/entities/NoteDraftEntityService.js';
import { NotificationEntityService } from '@/core/entities/NotificationEntityService.js';
import { PageEntityService } from '@/core/entities/PageEntityService.js';
import { PageLikeEntityService } from '@/core/entities/PageLikeEntityService.js';
import { SigninEntityService } from '@/core/entities/SigninEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { UserListEntityService } from '@/core/entities/UserListEntityService.js';
import { FlashEntityService } from '@/core/entities/FlashEntityService.js';
import { FlashLikeEntityService } from '@/core/entities/FlashLikeEntityService.js';
import { RoleEntityService } from '@/core/entities/RoleEntityService.js';
import { ReversiGameEntityService } from '@/core/entities/ReversiGameEntityService.js';
import { MetaEntityService } from '@/core/entities/MetaEntityService.js';
import { SystemWebhookEntityService } from '@/core/entities/SystemWebhookEntityService.js';

export function registerEntityServices(c: DependencyContainer): void {
	const classes: Array<new (...args: never[]) => unknown> = [
		AbuseUserReportEntityService,
		AbuseReportNotificationRecipientEntityService,
		AnnouncementEntityService,
		AntennaEntityService,
		AppEntityService,
		AuthSessionEntityService,
		BlockingEntityService,
		ChannelEntityService,
		ChatEntityService,
		ClipEntityService,
		DriveFileEntityService,
		DriveFolderEntityService,
		EmojiEntityService,
		FollowingEntityService,
		FollowRequestEntityService,
		GalleryLikeEntityService,
		GalleryPostEntityService,
		HashtagEntityService,
		InstanceEntityService,
		InviteCodeEntityService,
		ModerationLogEntityService,
		MutingEntityService,
		RenoteMutingEntityService,
		NoteEntityService,
		NoteFavoriteEntityService,
		NoteReactionEntityService,
		NoteDraftEntityService,
		NotificationEntityService,
		PageEntityService,
		PageLikeEntityService,
		SigninEntityService,
		UserEntityService,
		UserListEntityService,
		FlashEntityService,
		FlashLikeEntityService,
		RoleEntityService,
		ReversiGameEntityService,
		MetaEntityService,
		SystemWebhookEntityService,
	];

	for (const cls of classes) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		c.registerSingleton(cls as any);
	}
}
