/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Router } from '@/router.js';
import { i18n } from '@/i18n.js';
import { popups } from '@/os.js';
import { apLookup, openApLookupResult } from '@/utility/lookup.js';
import MkDialog from '@/components/MkDialog.vue';
import MkWaitingDialog from '@/components/MkWaitingDialog.vue';
import { loadApiErrorDefs } from '@/utility/api/guidance.js';

// ルーターを差し替え、ダイアログの表示内容は実際に popup に積まれた props で確かめる。
vi.mock('@/router.js', () => ({ mainRouter: { push: vi.fn(), pushByPath: vi.fn() } }));

function respondApiError(code: string, id = 'error-id') {
	const error = { code, id, message: 'error message', kind: 'client' };
	fetchMock.mockResponseOnce(JSON.stringify({ error }), { status: 400 });
	return error;
}

async function flush() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function lookupAndFail(uri: string): Promise<unknown> {
	const reason = await apLookup(uri).then(
		() => { throw new Error('should reject'); },
		(err: unknown) => err,
	);
	await flush();
	return reason;
}

function shownGuidances() {
	return popups.value
		.filter(p => p.component === MkDialog)
		.map(p => p.props as { type?: string; title?: string; text?: string })
		.map(({ type, title, text }) => ({ type, title, text }));
}

beforeAll(async () => {
	// 定義表は遅延読み込みなので、案内の表示が読み込みの完了待ちで遅れないよう先に読み込んでおく。
	await loadApiErrorDefs();
});

beforeEach(() => {
	fetchMock.resetMocks();
	fetchMock.doMock();
	popups.value = [];
});

describe('apLookup', () => {
	test('fetchingAsApObject の待機ダイアログを出し、応答で解決する', async () => {
		const res = { type: 'Note', object: { id: 'n1' } };
		fetchMock.mockResponseOnce(JSON.stringify(res));

		const promise = apLookup('https://remote.example/notes/1');
		const waiting = popups.value.find(p => p.component === MkWaitingDialog);
		expect(waiting?.props.text).toBe(i18n.ts.fetchingAsApObject);

		await expect(promise).resolves.toEqual(res);
		expect(shownGuidances()).toEqual([]);
	});

	test.each([
		['FEDERATION_NOT_ALLOWED', i18n.ts._remoteLookupErrors._federationNotAllowed],
		['URI_INVALID', i18n.ts._remoteLookupErrors._uriInvalid],
		['REQUEST_FAILED', i18n.ts._remoteLookupErrors._requestFailed],
		['RESPONSE_INVALID', i18n.ts._remoteLookupErrors._responseInvalid],
		['NO_SUCH_OBJECT', i18n.ts._remoteLookupErrors._noSuchObject],
	])('%s は定義表の案内を出し、元の値で reject', async (code, texts) => {
		const error = respondApiError(code);
		const reason = await lookupAndFail('https://remote.example/x');
		expect(reason).toEqual(error);
		expect(shownGuidances()).toEqual([{ type: 'error', title: texts.title, text: texts.description }]);
	});

	test('共通エラーは共通の案内を出す', async () => {
		respondApiError('RATE_LIMIT_EXCEEDED');
		await lookupAndFail('https://remote.example/x');
		expect(shownGuidances()).toEqual([{
			type: 'error',
			title: i18n.ts.cannotPerformTemporary,
			text: i18n.ts.cannotPerformTemporaryDescription,
		}]);
	});

	test('通信失敗で serverIsDead の案内を出し、元の例外で reject', async () => {
		const err = new TypeError('Failed to fetch');
		fetchMock.mockRejectOnce(err);
		const reason = await lookupAndFail('https://remote.example/x');
		expect(reason).toBe(err);
		expect(shownGuidances()).toEqual([{ type: 'error', title: i18n.ts.somethingHappened, text: i18n.ts.serverIsDead }]);
	});
});

describe('openApLookupResult', () => {
	function fakeRouter() {
		return { push: vi.fn() } as unknown as Router & { push: ReturnType<typeof vi.fn> };
	}

	test('リモートのユーザーは username@host のページへ', () => {
		const router = fakeRouter();
		openApLookupResult(router, { type: 'User', object: { username: 'alice', host: 'remote.example' } } as never);
		expect(router.push).toHaveBeenCalledWith('/@:acct/:page?', { params: { acct: 'alice@remote.example' } });
	});

	test('ローカルのユーザーは host を付けない', () => {
		const router = fakeRouter();
		openApLookupResult(router, { type: 'User', object: { username: 'bob', host: null } } as never);
		expect(router.push).toHaveBeenCalledWith('/@:acct/:page?', { params: { acct: 'bob' } });
	});

	test('ノートはノートのページへ', () => {
		const router = fakeRouter();
		openApLookupResult(router, { type: 'Note', object: { id: 'n1' } } as never);
		expect(router.push).toHaveBeenCalledWith('/notes/:noteId/:initialTab?', { params: { noteId: 'n1' } });
	});
});
