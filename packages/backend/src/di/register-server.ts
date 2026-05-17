/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';

import { ApiCallService } from '@/server/api/ApiCallService.js';
import { FileServerService } from '@/server/FileServerService.js';
import { HealthServerService } from '@/server/HealthServerService.js';
import { NodeinfoServerService } from '@/server/NodeinfoServerService.js';
import { ServerService } from '@/server/ServerService.js';
import { WellKnownServerService } from '@/server/WellKnownServerService.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ActivityPubServerService } from '@/server/ActivityPubServerService.js';
import { ApiLoggerService } from '@/server/api/ApiLoggerService.js';
import { ApiServerService } from '@/server/api/ApiServerService.js';
import { AuthenticateService } from '@/server/api/AuthenticateService.js';
import { RateLimiterService } from '@/server/api/RateLimiterService.js';
import { SigninApiService } from '@/server/api/SigninApiService.js';
import { SigninService } from '@/server/api/SigninService.js';
import { SignupApiService } from '@/server/api/SignupApiService.js';
import { StreamingApiServerService } from '@/server/api/StreamingApiServerService.js';
import { OpenApiServerService } from '@/server/api/openapi/OpenApiServerService.js';
import { ClientServerService } from '@/server/web/ClientServerService.js';
import { HtmlTemplateService } from '@/server/web/HtmlTemplateService.js';
import { FeedService } from '@/server/web/FeedService.js';
import { UrlPreviewService } from '@/server/web/UrlPreviewService.js';
import { ClientLoggerService } from '@/server/web/ClientLoggerService.js';
import { OAuth2ProviderService } from '@/server/oauth/OAuth2ProviderService.js';
import MainStreamConnection from '@/server/api/stream/Connection.js';
import { MainChannel } from '@/server/api/stream/channels/main.js';
import { AdminChannel } from '@/server/api/stream/channels/admin.js';
import { AntennaChannel } from '@/server/api/stream/channels/antenna.js';
import { ChannelChannel } from '@/server/api/stream/channels/channel.js';
import { DriveChannel } from '@/server/api/stream/channels/drive.js';
import { GlobalTimelineChannel } from '@/server/api/stream/channels/global-timeline.js';
import { HashtagChannel } from '@/server/api/stream/channels/hashtag.js';
import { HomeTimelineChannel } from '@/server/api/stream/channels/home-timeline.js';
import { HybridTimelineChannel } from '@/server/api/stream/channels/hybrid-timeline.js';
import { LocalTimelineChannel } from '@/server/api/stream/channels/local-timeline.js';
import { QueueStatsChannel } from '@/server/api/stream/channels/queue-stats.js';
import { ServerStatsChannel } from '@/server/api/stream/channels/server-stats.js';
import { UserListChannel } from '@/server/api/stream/channels/user-list.js';
import { RoleTimelineChannel } from '@/server/api/stream/channels/role-timeline.js';
import { ChatUserChannel } from '@/server/api/stream/channels/chat-user.js';
import { ChatRoomChannel } from '@/server/api/stream/channels/chat-room.js';
import { ReversiChannel } from '@/server/api/stream/channels/reversi.js';
import { ReversiGameChannel } from '@/server/api/stream/channels/reversi-game.js';
import { NoteStreamingHidingService } from '@/server/api/stream/NoteStreamingHidingService.js';
import { SigninWithPasskeyApiService } from '@/server/api/SigninWithPasskeyApiService.js';

// 旧 ServerModule. HTTP / WebSocket サーバ層のサービスを登録する。
//
// `MainStreamConnection` と Channel 系 (HomeTimelineChannel など) は旧設計で
// `Scope.TRANSIENT` だった。tsyringe では context container ではなく、
// WebSocket 接続単位の child container 側で `Lifecycle.Transient` 登録する (step 7)。
// ここでは singleton として登録するが、Connection から resolve する際に
// child container 側の登録が優先される。
export function registerServerServices(c: DependencyContainer): void {
	const singletons: Array<new (...args: never[]) => unknown> = [
		ClientServerService,
		ClientLoggerService,
		HtmlTemplateService,
		FeedService,
		HealthServerService,
		UrlPreviewService,
		ActivityPubServerService,
		FileServerService,
		NodeinfoServerService,
		ServerService,
		WellKnownServerService,
		GetterService,
		ApiCallService,
		ApiLoggerService,
		ApiServerService,
		AuthenticateService,
		RateLimiterService,
		SigninApiService,
		SigninWithPasskeyApiService,
		SigninService,
		SignupApiService,
		StreamingApiServerService,
		NoteStreamingHidingService,
		OpenApiServerService,
		OAuth2ProviderService,
	];

	for (const cls of singletons) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		c.registerSingleton(cls as any);
	}

	// MainStreamConnection と Channel は WebSocket 接続単位の child container で
	// transient 登録する。ここでは container resolve 時の参照のために singleton 風に登録するが、
	// 実際の接続単位生成は StreamingApiServerService が child container を作って resolve する。
	c.registerSingleton(MainStreamConnection);
	const channelClasses: Array<new (...args: never[]) => unknown> = [
		MainChannel,
		AdminChannel,
		AntennaChannel,
		ChannelChannel,
		DriveChannel,
		GlobalTimelineChannel,
		HashtagChannel,
		HomeTimelineChannel,
		HybridTimelineChannel,
		LocalTimelineChannel,
		QueueStatsChannel,
		ServerStatsChannel,
		UserListChannel,
		RoleTimelineChannel,
		ChatUserChannel,
		ChatRoomChannel,
		ReversiChannel,
		ReversiGameChannel,
	];
	for (const cls of channelClasses) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		c.registerSingleton(cls as any);
	}
}
