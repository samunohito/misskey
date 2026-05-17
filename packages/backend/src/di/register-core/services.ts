/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';

import { LoggerService } from '@/core/LoggerService.js';
import { AbuseReportService } from '@/core/AbuseReportService.js';
import { AbuseReportNotificationService } from '@/core/AbuseReportNotificationService.js';
import { AccountMoveService } from '@/core/AccountMoveService.js';
import { AccountUpdateService } from '@/core/AccountUpdateService.js';
import { AiService } from '@/core/AiService.js';
import { AnnouncementService } from '@/core/AnnouncementService.js';
import { AntennaService } from '@/core/AntennaService.js';
import { AchievementService } from '@/core/AchievementService.js';
import { AvatarDecorationService } from '@/core/AvatarDecorationService.js';
import { CaptchaService } from '@/core/CaptchaService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { DownloadService } from '@/core/DownloadService.js';
import { DriveService } from '@/core/DriveService.js';
import { EmailService } from '@/core/EmailService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { HashtagService } from '@/core/HashtagService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { IdService } from '@/core/IdService.js';
import { ImageProcessingService } from '@/core/ImageProcessingService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { MetaService } from '@/core/MetaService.js';
import { MfmService } from '@/core/MfmService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { NotePiningService } from '@/core/NotePiningService.js';
import { NoteDraftService } from '@/core/NoteDraftService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { PollService } from '@/core/PollService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { QueryService } from '@/core/QueryService.js';
import { ReactionService } from '@/core/ReactionService.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { RelayService } from '@/core/RelayService.js';
import { RoleService } from '@/core/RoleService.js';
import { S3Service } from '@/core/S3Service.js';
import { SignupService } from '@/core/SignupService.js';
import { WebAuthnService } from '@/core/WebAuthnService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { CacheService } from '@/core/CacheService.js';
import { UserService } from '@/core/UserService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { UserKeypairService } from '@/core/UserKeypairService.js';
import { UserListService } from '@/core/UserListService.js';
import { UserMutingService } from '@/core/UserMutingService.js';
import { UserRenoteMutingService } from '@/core/UserRenoteMutingService.js';
import { UserSearchService } from '@/core/UserSearchService.js';
import { UserSuspendService } from '@/core/UserSuspendService.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { UserWebhookService } from '@/core/UserWebhookService.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { WebhookTestService } from '@/core/WebhookTestService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { FileInfoService } from '@/core/FileInfoService.js';
import { FlashService } from '@/core/FlashService.js';
import { SearchService } from '@/core/SearchService.js';
import { ClipService } from '@/core/ClipService.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import { ChannelFollowingService } from '@/core/ChannelFollowingService.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import { ChatService } from '@/core/ChatService.js';
import { RegistryApiService } from '@/core/RegistryApiService.js';
import { ReversiService } from '@/core/ReversiService.js';
import { PageService } from '@/core/PageService.js';
import { QueueService } from '@/core/QueueService.js';

export function registerCoreSingletonServices(c: DependencyContainer): void {
	const classes: Array<new (...args: never[]) => unknown> = [
		LoggerService,
		AbuseReportService,
		AbuseReportNotificationService,
		AccountMoveService,
		AccountUpdateService,
		AiService,
		AnnouncementService,
		AntennaService,
		AchievementService,
		AvatarDecorationService,
		CaptchaService,
		CustomEmojiService,
		DeleteAccountService,
		DownloadService,
		DriveService,
		EmailService,
		FederatedInstanceService,
		FetchInstanceMetadataService,
		GlobalEventService,
		HashtagService,
		HttpRequestService,
		IdService,
		ImageProcessingService,
		InternalStorageService,
		MetaService,
		MfmService,
		ModerationLogService,
		NoteCreateService,
		NoteDeleteService,
		NotePiningService,
		NoteDraftService,
		NotificationService,
		PollService,
		SystemAccountService,
		PushNotificationService,
		QueryService,
		ReactionService,
		ReactionsBufferingService,
		RelayService,
		RoleService,
		S3Service,
		SignupService,
		WebAuthnService,
		UserBlockingService,
		CacheService,
		UserService,
		UserFollowingService,
		UserKeypairService,
		UserListService,
		UserMutingService,
		UserRenoteMutingService,
		UserSearchService,
		UserSuspendService,
		UserAuthService,
		VideoProcessingService,
		UserWebhookService,
		SystemWebhookService,
		WebhookTestService,
		UtilityService,
		FileInfoService,
		FlashService,
		SearchService,
		ClipService,
		FeaturedService,
		FanoutTimelineService,
		FanoutTimelineEndpointService,
		ChannelFollowingService,
		ChannelMutingService,
		ChatService,
		RegistryApiService,
		ReversiService,
		PageService,
		QueueService,
	];

	for (const cls of classes) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		c.registerSingleton(cls as any);
	}
}
