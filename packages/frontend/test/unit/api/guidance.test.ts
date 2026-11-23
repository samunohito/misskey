/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import locales from 'i18n';
import { i18n, updateI18n } from '@/i18n.js';
import { resolveApiGuidance } from '@/utility/api/guidance.js';
import { apiErrorDefs } from '@/utility/api/error-defs.js';
import type { ApiErrorDefs } from '@/utility/api/error-defs.js';
import type { ApiFailure, ApiErrorBody } from '@/utility/api/request.js';

function apiFailure(code: string, extra: Partial<ApiErrorBody> = {}): ApiFailure {
	const error: ApiErrorBody = { code, id: 'error-id', message: 'error message', ...extra };
	return { kind: 'api', error, raw: error };
}

afterEach(() => {
	// 翻訳の変更がほかのテストに残らないよう、setup.unit.ts の初期状態に戻す。
	updateI18n(locales['en-US']);
	vi.restoreAllMocks();
});

describe('resolveApiGuidance', () => {
	test('aborted は null', () => {
		expect(resolveApiGuidance('notes/create', { kind: 'aborted', raw: new DOMException('x', 'AbortError') })).toBeNull();
	});

	test('network は somethingHappened / serverIsDead', () => {
		expect(resolveApiGuidance('notes/create', { kind: 'network', raw: new TypeError('Failed to fetch') })).toEqual({
			title: i18n.ts.somethingHappened,
			text: i18n.ts.serverIsDead,
		});
	});

	test('invalid-response は gotInvalidResponseError / gotInvalidResponseErrorDescription', () => {
		expect(resolveApiGuidance('notes/create', { kind: 'invalid-response', raw: undefined })).toEqual({
			title: i18n.ts.gotInvalidResponseError,
			text: i18n.ts.gotInvalidResponseErrorDescription,
		});
	});

	test('other は somethingHappened と、raw に message があればそれ', () => {
		expect(resolveApiGuidance('notes/create', { kind: 'other', raw: new Error('invalid endpoint') })).toEqual({
			title: i18n.ts.somethingHappened,
			text: 'invalid endpoint',
		});
		expect(resolveApiGuidance('notes/create', { kind: 'other', raw: 42 })).toEqual({
			title: i18n.ts.somethingHappened,
			text: '',
		});
	});

	test('INTERNAL_ERROR は internalServerError / internalServerErrorDescription と copyInfo (Endpoint と info を含む)', () => {
		const info = { e: { message: 'boom', code: 'X' } };
		const guidance = resolveApiGuidance('notes/create', apiFailure('INTERNAL_ERROR', { info }), {
			overrides: { INTERNAL_ERROR: () => ({ text: 'overridden' }) },
		});
		expect(guidance?.title).toBe(i18n.ts.internalServerError);
		expect(guidance?.text).toBe(i18n.ts.internalServerErrorDescription);
		expect(guidance?.copyInfo).toMatch(/^Endpoint: notes\/create\nInfo: (.+)\nDate: (.+)$/);
		expect(guidance?.copyInfo).toContain(`Info: ${JSON.stringify(info)}\n`);
	});

	test.each([
		['RATE_LIMIT_EXCEEDED', 'cannotPerformTemporary', 'cannotPerformTemporaryDescription'],
		['INVALID_PARAM', 'invalidParamError', 'invalidParamErrorDescription'],
		['ROLE_PERMISSION_DENIED', 'permissionDeniedError', 'permissionDeniedErrorDescription'],
	] as const)('%s は固定の共通の案内で、overrides より優先', (code, titleKey, textKey) => {
		const guidance = resolveApiGuidance('notes/create', apiFailure(code), {
			overrides: { [code]: () => ({ title: 'o', text: 'overridden' }) },
			defs: { 'notes/create': { [code]: () => ({ title: 'd', text: 'def' }) } },
		});
		expect(guidance).toEqual({ title: i18n.ts[titleKey], text: i18n.ts[textKey] });
	});

	test('overrides は定義表より優先', () => {
		const guidance = resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'), {
			overrides: { NO_SUCH_NOTE: () => ({ title: 'o', text: 'overridden' }) },
			defs: { 'notes/create': { NO_SUCH_NOTE: () => ({ title: 'd', text: 'def' }) } },
		});
		expect(guidance).toEqual({ title: 'o', text: 'overridden' });
	});

	test('定義表はエンドポイント別に引く', () => {
		const defs: ApiErrorDefs = { 'notes/create': { NO_SUCH_NOTE: () => ({ title: 'd', text: 'def' }) } };
		expect(resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'), { defs })).toEqual({ title: 'd', text: 'def' });
		expect(resolveApiGuidance('notes/delete', apiFailure('NO_SUCH_NOTE'), { defs })).toEqual({ text: 'error message\nerror-id' });
	});

	test('定義表は TOO_MANY より優先', () => {
		const guidance = resolveApiGuidance('antennas/create', apiFailure('TOO_MANY_ANTENNAS'), {
			defs: { 'antennas/create': { TOO_MANY_ANTENNAS: () => ({ title: 'd', text: 'def' }) } },
		});
		expect(guidance).toEqual({ title: 'd', text: 'def' });
	});

	test('overrides は TOO_MANY より優先', () => {
		const guidance = resolveApiGuidance('antennas/create', apiFailure('TOO_MANY_ANTENNAS'), {
			overrides: { TOO_MANY_ANTENNAS: () => ({ text: 'overridden' }) },
		});
		expect(guidance).toEqual({ text: 'overridden' });
	});

	test('TOO_MANY で始まる code は youCannotCreateAnymore と「error: id」', () => {
		expect(resolveApiGuidance('antennas/create', apiFailure('TOO_MANY_ANTENNAS'))).toEqual({
			title: i18n.ts.youCannotCreateAnymore,
			text: `${i18n.ts.error}: error-id`,
		});
	});

	test('どれにも当たらなければ title なしで「message\\nid」', () => {
		const guidance = resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'));
		expect(guidance).toEqual({ text: 'error message\nerror-id' });
		expect(guidance).not.toHaveProperty('title');
	});

	test('Object.prototype の名前の code を上書きや定義表と取り違えない', () => {
		const guidance = resolveApiGuidance('notes/create', apiFailure('constructor'), { overrides: {}, defs: { 'notes/create': {} } });
		expect(guidance).toEqual({ text: 'error message\nerror-id' });
	});

	test('上書きや定義表の関数が throw したら報告して次の優先順へ進む', () => {
		const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
		const overrideErr = new Error('override threw');
		const defErr = new Error('def threw');
		const throwingDefs: ApiErrorDefs = { 'notes/create': { NO_SUCH_NOTE: () => { throw defErr; } } };

		expect(resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'), {
			overrides: { NO_SUCH_NOTE: () => { throw overrideErr; } },
			defs: { 'notes/create': { NO_SUCH_NOTE: () => ({ title: 'd', text: 'def' }) } },
		})).toEqual({ title: 'd', text: 'def' });
		expect(reported).toHaveBeenLastCalledWith(overrideErr);

		expect(resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'), {
			overrides: { NO_SUCH_NOTE: () => { throw overrideErr; } },
			defs: throwingDefs,
		})).toEqual({ text: 'error message\nerror-id' });
		// 上書きと定義表の両方が失敗すると、報告が2件増える。
		expect(reported).toHaveBeenCalledTimes(3);
		expect(reported).toHaveBeenLastCalledWith(defErr);

		expect(resolveApiGuidance('antennas/create', apiFailure('TOO_MANY_ANTENNAS'), {
			defs: { 'antennas/create': { TOO_MANY_ANTENNAS: () => { throw defErr; } } },
		})).toEqual({ title: i18n.ts.youCannotCreateAnymore, text: `${i18n.ts.error}: error-id` });
		expect(reported).toHaveBeenCalledTimes(4);
	});

	test('既定の定義表に pages/create と pages/update の NAME_ALREADY_EXISTS がある', () => {
		for (const endpoint of ['pages/create', 'pages/update']) {
			expect(resolveApiGuidance(endpoint, apiFailure('NAME_ALREADY_EXISTS'))).toEqual({
				title: i18n.ts.somethingHappened,
				text: i18n.ts._pages.nameAlreadyExists,
			});
		}
	});

	test('定義表の値は呼ばれた時点の i18n を引く (関数)', () => {
		const def = apiErrorDefs['pages/create']?.NAME_ALREADY_EXISTS;
		expect(def).toBeTypeOf('function');
		const en = locales['en-US'];
		updateI18n({ ...en, somethingHappened: 'changed title', _pages: { ...en._pages, nameAlreadyExists: 'changed text' } });
		expect(resolveApiGuidance('pages/create', apiFailure('NAME_ALREADY_EXISTS'))).toEqual({
			title: 'changed title',
			text: 'changed text',
		});
	});
});
