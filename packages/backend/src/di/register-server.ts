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
import { NoteStreamingHidingService } from '@/server/api/stream/NoteStreamingHidingService.js';
import { SigninWithPasskeyApiService } from '@/server/api/SigninWithPasskeyApiService.js';

// 旧 ServerModule. HTTP / WebSocket サーバ層のサービスを登録する。
//
// `MainStreamConnection` と Channel 系 (HomeTimelineChannel など) は request scope
// (旧 `Scope.TRANSIENT` + `@Inject(REQUEST)`) のためここでは登録しない。
// 接続/購読のたびに `StreamingApiServerService` と `Connection` が child container を作り、
// その中で `Lifecycle.Transient` で登録 → resolve する。
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
}
