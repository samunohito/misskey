/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { i18n } from '@/i18n.js';
import { resolveApiGuidance } from '@/utility/api/guidance.js';
import type { ApiFailure, ApiErrorBody } from '@/utility/api/request.js';

function apiFailure(code: string, extra: Partial<ApiErrorBody> = {}): ApiFailure {
	const error: ApiErrorBody = { code, id: 'error-id', message: 'error message', ...extra };
	return { kind: 'api', error, raw: error };
}

describe('resolveApiGuidance', () => {
	test('aborted は null', () => {
		expect(resolveApiGuidance('notes/show', { kind: 'aborted', raw: new DOMException('x', 'AbortError') })).toBeNull();
	});

	test('network は somethingHappened / serverIsDead', () => {
		expect(resolveApiGuidance('notes/show', { kind: 'network', raw: new TypeError('Failed to fetch') })).toEqual({
			title: i18n.ts.somethingHappened,
			text: i18n.ts.serverIsDead,
		});
	});

	test('invalid-response は gotInvalidResponseError / gotInvalidResponseErrorDescription', () => {
		expect(resolveApiGuidance('notes/show', { kind: 'invalid-response', raw: undefined })).toEqual({
			title: i18n.ts.gotInvalidResponseError,
			text: i18n.ts.gotInvalidResponseErrorDescription,
		});
	});

	test('other は somethingHappened と、raw に message があればそれ', () => {
		expect(resolveApiGuidance('notes/show', { kind: 'other', raw: new Error('invalid endpoint') })).toEqual({
			title: i18n.ts.somethingHappened,
			text: 'invalid endpoint',
		});
		expect(resolveApiGuidance('notes/show', { kind: 'other', raw: 42 })).toEqual({
			title: i18n.ts.somethingHappened,
			text: '',
		});
	});

	test('INTERNAL_ERROR は internalServerError / internalServerErrorDescription と copyInfo (Endpoint と info を含む)', () => {
		const info = { e: { message: 'boom', code: 'X' } };
		const guidance = resolveApiGuidance('notes/show', apiFailure('INTERNAL_ERROR', { info }));
		expect(guidance?.title).toBe(i18n.ts.internalServerError);
		expect(guidance?.text).toBe(i18n.ts.internalServerErrorDescription);
		expect(guidance?.copyInfo).toMatch(/^Endpoint: notes\/show\nInfo: (.+)\nDate: (.+)$/);
		expect(guidance?.copyInfo).toContain(`Info: ${JSON.stringify(info)}\n`);
	});

	test.each([
		['RATE_LIMIT_EXCEEDED', 'cannotPerformTemporary', 'cannotPerformTemporaryDescription'],
		['INVALID_PARAM', 'invalidParamError', 'invalidParamErrorDescription'],
		['ROLE_PERMISSION_DENIED', 'permissionDeniedError', 'permissionDeniedErrorDescription'],
	] as const)('%s は固定の共通の案内', (code, titleKey, textKey) => {
		expect(resolveApiGuidance('notes/show', apiFailure(code))).toEqual({ title: i18n.ts[titleKey], text: i18n.ts[textKey] });
	});

	test('TOO_MANY で始まる code は youCannotCreateAnymore と「error: id」', () => {
		expect(resolveApiGuidance('antennas/create', apiFailure('TOO_MANY_ANTENNAS'))).toEqual({
			title: i18n.ts.youCannotCreateAnymore,
			text: `${i18n.ts.error}: error-id`,
		});
	});

	test('どれにも当たらなければ title なしで「message\\nid」', () => {
		const guidance = resolveApiGuidance('notes/show', apiFailure('NO_SUCH_NOTE'));
		expect(guidance).toEqual({ text: 'error message\nerror-id' });
		expect(guidance).not.toHaveProperty('title');
	});
});
