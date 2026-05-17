/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { CaptchaService, supportedCaptchaProviders } from '@/core/CaptchaService.js';

export const meta = {
	tags: ['admin', 'captcha'],

	requireCredential: true,
	requireAdmin: true,

	// 実態はmetaの取得であるため
	kind: 'read:admin:meta',

	res: {
		type: 'object',
		properties: {
			provider: {
				type: 'string',
				enum: supportedCaptchaProviders,
			},
			hcaptcha: {
				type: 'object',
				properties: {
					siteKey: { type: 'string', nullable: true },
					secretKey: { type: 'string', nullable: true },
				},
			},
			mcaptcha: {
				type: 'object',
				properties: {
					siteKey: { type: 'string', nullable: true },
					secretKey: { type: 'string', nullable: true },
					instanceUrl: { type: 'string', nullable: true },
				},
			},
			recaptcha: {
				type: 'object',
				properties: {
					siteKey: { type: 'string', nullable: true },
					secretKey: { type: 'string', nullable: true },
				},
			},
			turnstile: {
				type: 'object',
				properties: {
					siteKey: { type: 'string', nullable: true },
					secretKey: { type: 'string', nullable: true },
				},
			},
		},
	},
} as const;

export const paramDef = {} as const;

@injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@inject(delay(() => CaptchaService))
		private captchaService: CaptchaService,
	) {
		super(meta, paramDef, async () => {
			return this.captchaService.get();
		});
	}
}
