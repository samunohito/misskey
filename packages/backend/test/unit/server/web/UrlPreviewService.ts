/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';
import type { MiMeta } from '@/models/Meta.js';
import type { UtilityService } from '@/core/UtilityService.js';
import { UrlPreviewService } from '@/server/web/UrlPreviewService.js';
import type { SummalyResult } from '@misskey-dev/summaly';

const { summalyMock } = vi.hoisted(() => ({
	summalyMock: vi.fn(),
}));

vi.mock('@misskey-dev/summaly', () => ({
	summaly: summalyMock,
}));

const preview: SummalyResult = {
	url: 'https://redirected.example.test/article?state=RESULT_QUERY_CANARY',
	title: 'REMOTE_TITLE_CANARY',
	icon: null,
	description: null,
	thumbnail: 'https://cdn.example.test/image.png',
	thumbnailStyle: null,
	sitename: null,
	player: { url: null, width: null, height: null, allow: [] },
	activityPub: null,
	fediverseCreator: null,
};

const services: UrlPreviewService[] = [];

function createService(debug: ReturnType<typeof vi.fn>): UrlPreviewService {
	vi.stubGlobal('_SUMMALY_VERSION_', 'test');
	summalyMock.mockResolvedValue(preview);
	const loggerService = {
		getLogger: () => ({ debug, write: vi.fn() }),
	} as unknown as LoggerService;
	const meta = {
		urlPreviewEnabled: true,
		urlPreviewSummaryProxyUrl: null,
		urlPreviewSensitiveList: [],
	} as unknown as MiMeta;
	const config = {
		url: 'https://misskey.example.test',
		mediaProxy: 'https://proxy.example.test',
	} as Config;
	const service = new UrlPreviewService(
		config,
		meta,
		{} as HttpRequestService,
		{ isKeyWordIncluded: () => false } as unknown as UtilityService,
		loggerService,
	);
	services.push(service);
	return service;
}

function createReply() {
	return {
		code: vi.fn(),
		header: vi.fn(),
	};
}

describe('UrlPreviewService diagnostics', () => {
	afterEach(() => {
		for (const service of services.splice(0)) service.dispose();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	test('keeps non-production diagnostics to bounded URL metadata', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const debug = vi.fn();
		const service = createService(debug);

		await service.handle({ query: { url: 'https://user:password@example.test/private?token=REQUEST_QUERY_CANARY' } } as never, createReply() as never);

		expect(debug).toHaveBeenNthCalledWith(1, {
			message: 'URL preview requested',
			attributes: {
				'url.origin': 'https://example.test',
				'url_preview.proxy': false,
			},
		});
		expect(debug).toHaveBeenNthCalledWith(2, {
			message: 'URL preview completed',
			attributes: {
				'url.origin': 'https://example.test',
				'destination.origin': 'https://redirected.example.test',
				'url_preview.has_title': true,
				'url_preview.has_thumbnail': true,
			},
		});
		expect(JSON.stringify(debug.mock.calls)).not.toContain('password');
		expect(JSON.stringify(debug.mock.calls)).not.toContain('REQUEST_QUERY_CANARY');
		expect(JSON.stringify(debug.mock.calls)).not.toContain('RESULT_QUERY_CANARY');
		expect(JSON.stringify(debug.mock.calls)).not.toContain('REMOTE_TITLE_CANARY');
	});

	test('keeps production diagnostics as fixed messages', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const debug = vi.fn();
		const service = createService(debug);

		await service.handle({ query: { url: 'https://example.test/' } } as never, createReply() as never);

		expect(debug).toHaveBeenNthCalledWith(1, 'URL preview requested');
		expect(debug).toHaveBeenNthCalledWith(2, 'URL preview completed');
	});
});
