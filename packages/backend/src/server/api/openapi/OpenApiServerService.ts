/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, injectable } from 'tsyringe';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { genOpenapiSpec } from './gen-spec.js';
import { ApiDocPage } from './api-doc.js';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

@injectable()
export class OpenApiServerService {
	constructor(
		@inject(DI.config)
		private config: Config,
	) {
	}

	@bindThis
	public createServer(fastify: FastifyInstance, _options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.get('/api-doc', async (_request, reply) => {
			reply.header('Cache-Control', 'public, max-age=86400');
			reply.type('text/html; charset=utf-8');
			reply.send(await ApiDocPage());
		});
		fastify.get('/api.json', (_request, reply) => {
			reply.header('Cache-Control', 'public, max-age=600');
			reply.send(genOpenapiSpec(this.config));
		});
		done();
	}
}
