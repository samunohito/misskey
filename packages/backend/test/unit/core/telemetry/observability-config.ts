/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { buildSentryTracePropagationTargets, isForbiddenAdditionalAttributeKey, resolveAdditionalAllowedSpanAttributes, resolvePropagationAllowedOrigins } from '@/core/telemetry/observability-config.js';

describe('observability-config', () => {
	test('canonicalizes HTTP(S) origins and deduplicates equivalent spellings', () => {
		expect(resolvePropagationAllowedOrigins([
			'HTTPS://Internal.Example/',
			'https://internal.example',
			'http://127.0.0.1:8080',
		])).toEqual(['https://internal.example', 'http://127.0.0.1:8080']);
	});

	test('treats unset and empty propagation lists differently without ever widening to all hosts', () => {
		expect(resolvePropagationAllowedOrigins(undefined)).toBeUndefined();
		expect(resolvePropagationAllowedOrigins([])).toEqual([]);
		expect(buildSentryTracePropagationTargets([])).toEqual([]);
	});

	test('rejects non-origin URL forms and wildcards', () => {
		for (const invalid of [
			'ftp://internal.example',
			'https://user:password@internal.example',
			'https://internal.example/private',
			'https://internal.example?token=secret',
			'https://internal.example#fragment',
			'https://*.internal.example',
			'not-a-url',
		]) {
			expect(() => resolvePropagationAllowedOrigins([invalid])).toThrow('propagationAllowedOrigins');
		}
	});

	test('validates additional attributes as an additive policy and rejects sensitive bypass keys', () => {
		expect(resolveAdditionalAllowedSpanAttributes(['tenant.id', 'user_agent.original', 'tenant.id'])).toEqual(['tenant.id', 'user_agent.original']);
		for (const forbidden of [
			'url.query',
			'http.target',
			'db.statement',
			'db.query.parameter.0',
			'http.request.header.authorization',
			'http.request.header.proxy-authorization',
			'http.request.header.proxy_authorization',
			'http.request.header.x_api_key',
			'http.response.headers.set_cookie',
		]) {
			expect(isForbiddenAdditionalAttributeKey(forbidden)).toBe(true);
			expect(() => resolveAdditionalAllowedSpanAttributes([forbidden])).toThrow('additionalAllowedSpanAttributes');
		}
	});
});
