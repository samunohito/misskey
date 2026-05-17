/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';

import * as fs from 'node:fs';
import { resolve } from 'node:path';
import type { Config } from '@/config.js';
import type { DriveFilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { StatusError } from '@/misc/status-error.js';
import type Logger from '@/logger.js';
import { DownloadService } from '@/core/DownloadService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { FileInfoService } from '@/core/FileInfoService.js';
import { ImageProcessingService } from '@/core/ImageProcessingService.js';
import { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import { handleRequestRedirectToOmitSearch } from '@/misc/fastify-hook-handlers.js';
import { FileServerDriveHandler } from './file/FileServerDriveHandler.js';
import { FileServerFileResolver } from './file/FileServerFileResolver.js';
import { FileServerProxyHandler } from './file/FileServerProxyHandler.js';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';

@injectable()
export class FileServerService {
	private logger: Logger;
	private driveHandler: FileServerDriveHandler;
	private proxyHandler: FileServerProxyHandler;
	private fileResolver: FileServerFileResolver;

	private readonly assets: string;

	constructor(
		@inject(DI.config)
		private config: Config,

		@inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@inject(delay(() => FileInfoService))
		private fileInfoService: FileInfoService,

		@inject(delay(() => DownloadService))
		private downloadService: DownloadService,

		@inject(delay(() => ImageProcessingService))
		private imageProcessingService: ImageProcessingService,

		@inject(delay(() => VideoProcessingService))
		private videoProcessingService: VideoProcessingService,

		@inject(delay(() => InternalStorageService))
		private internalStorageService: InternalStorageService,

		@inject(delay(() => LoggerService))
		private loggerService: LoggerService) {
		this.logger = this.loggerService.getLogger('server', 'gray');
		this.assets = resolve(this.config.rootDir, 'packages/backend/src/server/file/assets');
		this.fileResolver = new FileServerFileResolver(
			this.driveFilesRepository,
			this.fileInfoService,
			this.downloadService,
			this.internalStorageService,
		);
		this.driveHandler = new FileServerDriveHandler(
			this.config,
			this.fileResolver,
			this.assets,
			this.videoProcessingService,
		);
		this.proxyHandler = new FileServerProxyHandler(
			this.config,
			this.fileResolver,
			this.assets,
			this.imageProcessingService,
		);

		//this.createServer = this.createServer.bind(this);
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.addHook('onRequest', (request, reply, done) => {
			reply.header('Content-Security-Policy', 'default-src \'none\'; img-src \'self\'; media-src \'self\'; style-src \'unsafe-inline\'');
			if (process.env.NODE_ENV === 'development') {
				reply.header('Access-Control-Allow-Origin', '*');
			}
			done();
		});

		fastify.register((fastify, options, done) => {
			fastify.addHook('onRequest', handleRequestRedirectToOmitSearch);
			fastify.get('/files/app-default.jpg', (request, reply) => {
				const file = fs.createReadStream(`${this.assets}/dummy.png`);
				reply.header('Content-Type', 'image/jpeg');
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				return reply.send(file);
			});

			fastify.get<{ Params: { key: string; } }>('/files/:key', async (request, reply) => {
				return await this.driveHandler.handle(request, reply)
					.catch(err => this.errorHandler(request, reply, err));
			});
			fastify.get<{ Params: { key: string; } }>('/files/:key/*', async (request, reply) => {
				return await reply.redirect(`${this.config.url}/files/${request.params.key}`, 301);
			});
			done();
		});

		fastify.get<{
			Params: { url: string; };
			Querystring: { url?: string; };
		}>('/proxy/:url*', async (request, reply) => {
			return await this.proxyHandler.handle(request, reply)
				.catch(err => this.errorHandler(request, reply, err));
		});

		done();
	}

	@bindThis
	private async errorHandler(request: FastifyRequest<{ Params?: { [x: string]: any }; Querystring?: { [x: string]: any }; }>, reply: FastifyReply, err?: any) {
		this.logger.error(`${err}`);

		reply.header('Cache-Control', 'max-age=300');

		if (request.query && 'fallback' in request.query) {
			return reply.sendFile('/dummy.png', this.assets);
		}

		if (err instanceof StatusError && (err.statusCode === 302 || err.isClientError)) {
			reply.code(err.statusCode);
			return;
		}

		reply.code(500);
		return;
	}
}
