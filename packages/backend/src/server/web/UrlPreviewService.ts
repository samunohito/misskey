/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { summaly } from '@misskey-dev/summaly';
import { SummalyResult } from '@misskey-dev/summaly/built/summary.js';
import Redlock, { RedlockAbortSignal } from 'redlock';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { MetaService } from '@/core/MetaService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type Logger from '@/logger.js';
import { query } from '@/misc/prelude/url.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import { ApiError } from '@/server/api/error.js';
import { MiMeta } from '@/models/Meta.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const URL_PREVIEW_REDIS_RETRY_COUNT = 20;
const URL_PREVIEW_REDIS_RETRY_DELAY = 200; // 200 milliseconds
const URL_PREVIEW_REDIS_RETRY_JITTER = 200; // 200 milliseconds
const URL_PREVIEW_REDIS_AUTOMATIC_EXTENSION_THRESHOLD = 500; // 500 milliseconds
const URL_PREVIEW_REDIS_LOCK_DURATION = 10000; // 10 seconds
const URL_PREVIEW_REDIS_CACHE_EXPIRATION_SECONDS = 60 * 60; // 1 hour

@Injectable()
export class UrlPreviewService {
	private logger: Logger;
	private redlock: Redlock;

	constructor(
		@Inject(DI.config)
		private config: Config,
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		private metaService: MetaService,
		private httpRequestService: HttpRequestService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('url-preview');

		// このあたりのパラメータは調整の余地があるかもしれない
		this.redlock = new Redlock([this.redisClient], {
			retryCount: URL_PREVIEW_REDIS_RETRY_COUNT,
			retryDelay: URL_PREVIEW_REDIS_RETRY_DELAY,
			retryJitter: URL_PREVIEW_REDIS_RETRY_JITTER,
			automaticExtensionThreshold: URL_PREVIEW_REDIS_AUTOMATIC_EXTENSION_THRESHOLD,
		});
	}

	@bindThis
	private wrap(url?: string | null): string | null {
		return url != null
			? url.match(/^https?:\/\//)
				? `${this.config.mediaProxy}/preview.webp?${query({
					url,
					preview: '1',
				})}`
				: url
			: null;
	}

	@bindThis
	public async handle(
		request: FastifyRequest<{ Querystring: { url: string; lang?: string; } }>,
		reply: FastifyReply,
	): Promise<object | undefined> {
		const url = request.query.url;
		if (typeof url !== 'string') {
			reply.code(400);
			return;
		}

		const lang = request.query.lang;
		if (Array.isArray(lang)) {
			reply.code(400);
			return;
		}

		const meta = await this.metaService.fetch();
		if (!meta.urlPreviewEnabled) {
			reply.code(403);
			return {
				error: new ApiError({
					message: 'URL preview is disabled',
					code: 'URL_PREVIEW_DISABLED',
					id: '58b36e13-d2f5-0323-b0c6-76aa9dabefb8',
				}),
			};
		}

		try {
			const summary: SummalyResult = await this.summarySynchronize(lang ?? 'ja-JP', url, meta);

			if (!(summary.url.startsWith('http://') || summary.url.startsWith('https://'))) {
				throw new Error('unsupported schema included');
			}

			if (summary.player.url && !(summary.player.url.startsWith('http://') || summary.player.url.startsWith('https://'))) {
				throw new Error('unsupported schema included');
			}

			summary.icon = this.wrap(summary.icon);
			summary.thumbnail = this.wrap(summary.thumbnail);

			// Cache 7days
			reply.header('Cache-Control', 'max-age=604800, immutable');

			return summary;
		} catch (err) {
			this.logger.warn(`Failed to get preview of ${url}: ${err}`);

			reply.code(422);
			reply.header('Cache-Control', 'max-age=86400, immutable');
			return {
				error: new ApiError({
					message: 'Failed to get preview',
					code: 'URL_PREVIEW_FAILED',
					id: '09d01cb5-53b9-4856-82e5-38a50c290a3b',
				}),
			};
		}
	}

	private async summarySynchronize(lang: string | undefined, url: string, meta: MiMeta): Promise<SummalyResult> {
		const resourceKey = `url-preview:${url}`;
		return this.redlock.using(
			[`${resourceKey}:lock`],
			URL_PREVIEW_REDIS_LOCK_DURATION,
			async (signal: RedlockAbortSignal) => {
				if (signal.aborted) {
					throw signal.error;
				}

				const cache = await this.redisClient.get(resourceKey);
				if (cache) {
					try {
						const cacheResult = JSON.parse(cache) as SummalyResult;
						this.logger.succ(`retrieved from cache [title: ${cacheResult.title}, url: ${url}]`);

						return cacheResult;
					} catch (error) {
						// パースに失敗した場合はキャッシュを削除して初回取得と同じロジックで処理する
						this.logger.warn(`Failed to parse cache [error: ${error}, url: ${url}]`);
						await this.redisClient.del([resourceKey]);
					}
				}

				this.logger.info(meta.urlPreviewSummaryProxyUrl
					? `(Proxy) Getting preview of ${url}@${lang} ...`
					: `Getting preview of ${url}@${lang} ...`);

				const summary = meta.urlPreviewSummaryProxyUrl
					? await this.fetchSummaryFromProxy(url, meta, lang)
					: await this.fetchSummary(url, meta, lang);

				this.logger.succ(`Got preview of ${url}: ${summary.title}`);

				await this.redisClient.setex(resourceKey, URL_PREVIEW_REDIS_CACHE_EXPIRATION_SECONDS, JSON.stringify(summary));

				return summary;
			},
		);
	}

	private fetchSummary(url: string, meta: MiMeta, lang?: string): Promise<SummalyResult> {
		const agent = this.config.proxy
			? {
				http: this.httpRequestService.httpAgent,
				https: this.httpRequestService.httpsAgent,
			}
			: undefined;

		return summaly(url, {
			followRedirects: false,
			lang: lang ?? 'ja-JP',
			agent: agent,
			userAgent: meta.urlPreviewUserAgent ?? undefined,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});
	}

	private fetchSummaryFromProxy(url: string, meta: MiMeta, lang?: string): Promise<SummalyResult> {
		const proxy = meta.urlPreviewSummaryProxyUrl!;
		const queryStr = query({
			url: url,
			lang: lang ?? 'ja-JP',
			userAgent: meta.urlPreviewUserAgent ?? undefined,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});

		return this.httpRequestService.getJson<SummalyResult>(`${proxy}?${queryStr}`);
	}
}
