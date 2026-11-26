/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ApiFailure, ApiErrorBody } from '@/utility/api/request.js';

// 定義表のモジュールを読み込むたびに数え、失敗も差し込めるようにする。
const loadState = vi.hoisted(() => ({ loads: 0, failNext: 0 }));
const reportMock = vi.hoisted(() => vi.fn());

function apiFailure(code: string): ApiFailure {
	const error: ApiErrorBody = { code, id: 'error-id', message: 'error message' };
	return { kind: 'api', error, raw: error };
}

/** モジュールを読み込み直し、定義表の読み込みのキャッシュを持たない guidance.ts を返す。 */
async function freshGuidance() {
	vi.resetModules();
	vi.doMock('@/utility/api/report-error.js', () => ({ reportApiCallbackError: reportMock }));
	vi.doMock('@/utility/api/error-defs.js', () => {
		loadState.loads++;
		if (loadState.failNext > 0) {
			loadState.failNext--;
			throw new Error('chunk load failed');
		}
		return {
			apiErrorDefs: {
				'notes/create': { NO_SUCH_NOTE: () => ({ title: 'd', text: 'from defs' }) },
			},
		};
	});
	// 読み込み直した i18n には setup.unit.ts の翻訳が入っていないため、入れ直す。
	const [{ updateI18n }, { default: locales }] = await Promise.all([import('@/i18n.js'), import('i18n')]);
	updateI18n(locales['en-US']);
	return await import('@/utility/api/guidance.js');
}

beforeEach(() => {
	loadState.loads = 0;
	loadState.failNext = 0;
	reportMock.mockReset();
});

afterEach(() => {
	vi.doUnmock('@/utility/api/error-defs.js');
	vi.doUnmock('@/utility/api/report-error.js');
});

describe('定義表の遅延読み込み', () => {
	test('API エラー以外の失敗、固定の共通エラー、上書きで決まるときは定義表を読み込まない', async () => {
		const { resolveApiGuidance } = await freshGuidance();
		await resolveApiGuidance('notes/create', { kind: 'network', raw: new TypeError('x') });
		await resolveApiGuidance('notes/create', { kind: 'aborted', raw: undefined });
		await resolveApiGuidance('notes/create', apiFailure('RATE_LIMIT_EXCEEDED'));
		await resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'), {
			overrides: { NO_SUCH_NOTE: () => ({ text: 'overridden' }) },
		});
		expect(loadState.loads).toBe(0);
	});

	test('defs を渡したときは定義表を読み込まない', async () => {
		const { resolveApiGuidance } = await freshGuidance();
		expect(await resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'), { defs: {} })).toEqual({
			text: 'error message\nerror-id',
		});
		expect(loadState.loads).toBe(0);
	});

	test('定義表が要るときに一度だけ読み込み、以後は使い回す', async () => {
		const { resolveApiGuidance } = await freshGuidance();
		const [a, b] = await Promise.all([
			resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE')),
			resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE')),
		]);
		const c = await resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'));
		expect([a, b, c]).toEqual(Array(3).fill({ title: 'd', text: 'from defs' }));
		expect(loadState.loads).toBe(1);
	});

	test('読み込みに失敗したら報告し、定義表なしで TOO_MANY や汎用の表示に進む。次の失敗では読み込みをやり直す', async () => {
		loadState.failNext = 1;
		const { resolveApiGuidance } = await freshGuidance();

		expect(await resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'))).toEqual({ text: 'error message\nerror-id' });
		expect(reportMock).toHaveBeenCalledTimes(1);

		expect(await resolveApiGuidance('notes/create', apiFailure('NO_SUCH_NOTE'))).toEqual({ title: 'd', text: 'from defs' });
		expect(loadState.loads).toBe(2);
	});
});
