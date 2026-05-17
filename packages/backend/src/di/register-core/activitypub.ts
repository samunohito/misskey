/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Lifecycle } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe';

import { ApAudienceService } from '@/core/activitypub/ApAudienceService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { ApInboxService } from '@/core/activitypub/ApInboxService.js';
import { ApLoggerService } from '@/core/activitypub/ApLoggerService.js';
import { ApMfmService } from '@/core/activitypub/ApMfmService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApRequestService } from '@/core/activitypub/ApRequestService.js';
import { ApResolverService, Resolver } from '@/core/activitypub/ApResolverService.js';
import { JsonLdService } from '@/core/activitypub/JsonLdService.js';
import { RemoteLoggerService } from '@/core/RemoteLoggerService.js';
import { RemoteUserResolveService } from '@/core/RemoteUserResolveService.js';
import { WebfingerService } from '@/core/WebfingerService.js';
import { ApImageService } from '@/core/activitypub/models/ApImageService.js';
import { ApMentionService } from '@/core/activitypub/models/ApMentionService.js';
import { ApNoteService } from '@/core/activitypub/models/ApNoteService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { ApQuestionService } from '@/core/activitypub/models/ApQuestionService.js';

export function registerActivityPubServices(c: DependencyContainer): void {
	const singletons: Array<new (...args: never[]) => unknown> = [
		ApAudienceService,
		ApDbResolverService,
		ApDeliverManagerService,
		ApInboxService,
		ApLoggerService,
		ApMfmService,
		ApRendererService,
		ApRequestService,
		ApResolverService,
		JsonLdService,
		RemoteLoggerService,
		RemoteUserResolveService,
		WebfingerService,
		ApImageService,
		ApMentionService,
		ApNoteService,
		ApPersonService,
		ApQuestionService,
	];

	for (const cls of singletons) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		c.registerSingleton(cls as any);
	}

	// Resolver は旧 NestJS で `Scope.TRANSIENT`。
	// `ApResolverService.createResolver()` から都度生成される利用パターン。
	c.register(Resolver, { useClass: Resolver }, { lifecycle: Lifecycle.Transient });
}
