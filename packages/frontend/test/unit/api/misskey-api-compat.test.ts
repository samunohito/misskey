/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiUrl } from '@@/js/config.js';
import { misskeyApi, misskeyApiGet, pendingApiRequestsCount } from '@/utility/misskey-api.js';

const iMock = vi.hoisted(() => ({ value: null as { token: string } | null }));

vi.mock('@/i.js', () => ({
	get $i() {
		return iMock.value;
	},
}));

function lastFetchInit(): RequestInit {
	const init = fetchMock.mock.calls.at(-1)?.[1];
	if (init == null) throw new Error('fetch was not called with init');
	return init;
}

function lastFetchUrl(): string {
	return String(fetchMock.mock.calls.at(-1)?.[0]);
}

beforeEach(() => {
	fetchMock.resetMocks();
	// resetMocks() 後も setup.unit.ts の locale 用の絞り込みが残るため、API の fetch も差し替え対象にする。
	fetchMock.doMock();
	iMock.value = null;
});

const rejectCases = (call: () => Promise<unknown>) => {
	test('有効な error は error オブジェクトそのもので reject', async () => {
		const error = { code: 'NO_SUCH_USER', id: 'x', message: 'm', kind: 'client' };
		fetchMock.mockResponseOnce(JSON.stringify({ error }), { status: 400 });
		await expect(call()).rejects.toEqual(error);
	});

	test('API エラーの構造を満たさない error もそのまま reject', async () => {
		// `invalid-response` に分類される本文でも、元の `error` が reject の理由になる。
		fetchMock.mockResponseOnce('{"error":{}}', { status: 500 });
		await expect(call()).rejects.toEqual({});
	});

	test('error のない JSON は undefined で reject', async () => {
		fetchMock.mockResponseOnce('{}', { status: 500 });
		await expect(call()).rejects.toBeUndefined();
	});

	test('本文が null のエラー応答は TypeError で reject', async () => {
		fetchMock.mockResponseOnce('null', { status: 500 });
		await expect(call()).rejects.toBeInstanceOf(TypeError);
	});

	test('JSON でない本文は SyntaxError で reject', async () => {
		fetchMock.mockResponseOnce('<html>', { status: 502 });
		await expect(call()).rejects.toBeInstanceOf(SyntaxError);
	});

	test('200 で JSON でない本文も SyntaxError で reject', async () => {
		fetchMock.mockResponseOnce('<html>', { status: 200 });
		await expect(call()).rejects.toBeInstanceOf(SyntaxError);
	});

	test('fetch の失敗はその例外で reject', async () => {
		const err = new TypeError('Failed to fetch');
		fetchMock.mockRejectOnce(err);
		await expect(call()).rejects.toBe(err);
	});

	test('200 は本文で、204 は undefined で resolve', async () => {
		fetchMock.mockResponseOnce('{"a":1}');
		await expect(call()).resolves.toEqual({ a: 1 });
		fetchMock.mockResponseOnce('', { status: 204 });
		await expect(call()).resolves.toBeUndefined();
	});

	test('pendingApiRequestsCount を呼んだ時点で1増やし、決着後に戻す', async () => {
		const base = pendingApiRequestsCount.value;

		fetchMock.mockResponseOnce('{}');
		const ok = call();
		expect(pendingApiRequestsCount.value).toBe(base + 1);
		await ok;
		expect(pendingApiRequestsCount.value).toBe(base);

		fetchMock.mockRejectOnce(new TypeError('Failed to fetch'));
		const failed = call();
		expect(pendingApiRequestsCount.value).toBe(base + 1);
		await failed.catch(() => {});
		expect(pendingApiRequestsCount.value).toBe(base);
	});
};

describe('misskeyApi の互換', () => {
	describe('reject 値の規則', () => {
		rejectCases(() => misskeyApi('meta', {}));
	});

	test(':// を含むエンドポイント名は同期的に throw し、pendingApiRequestsCount を変えない', () => {
		const base = pendingApiRequestsCount.value;
		expect(() => misskeyApi('https://x' as any, {})).toThrow('invalid endpoint');
		expect(pendingApiRequestsCount.value).toBe(base);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('params を JSON にできなければ reject (throw しない)', async () => {
		const base = pendingApiRequestsCount.value;
		let promise: Promise<unknown> | undefined;
		expect(() => {
			promise = misskeyApi('meta', { n: 1n } as any);
		}).not.toThrow();
		await expect(promise).rejects.toBeInstanceOf(TypeError);
		expect(pendingApiRequestsCount.value).toBe(base);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('data に i を書き込めなければ reject (throw しない)', async () => {
		iMock.value = { token: 'TOKEN' };
		const base = pendingApiRequestsCount.value;

		for (const data of [Object.freeze({}), null]) {
			let promise: Promise<unknown> | undefined;
			expect(() => {
				promise = misskeyApi('meta', data as any);
			}).not.toThrow();
			await expect(promise).rejects.toBeInstanceOf(TypeError);
		}
		expect(pendingApiRequestsCount.value).toBe(base);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('渡した data に i が書き込まれる (現行の挙動)', async () => {
		iMock.value = { token: 'TOKEN' };

		const data: Record<string, unknown> = { a: 1 };
		fetchMock.mockResponseOnce('{}');
		const promise = misskeyApi('meta', data as any);
		// `data.i` の書き換えはリクエストの完了を待たずに確認できる。
		expect(data.i).toBe('TOKEN');
		await promise;
		expect(JSON.parse(lastFetchInit().body as string)).toEqual({ a: 1, i: 'TOKEN' });

		const data2: Record<string, unknown> = { a: 1 };
		fetchMock.mockResponseOnce('{}');
		await misskeyApi('meta', data2 as any, 'OTHER');
		expect(data2.i).toBe('OTHER');
		expect(JSON.parse(lastFetchInit().body as string)).toEqual({ a: 1, i: 'OTHER' });

		const data3: Record<string, unknown> = { a: 1 };
		fetchMock.mockResponseOnce('{}');
		await misskeyApi('meta', data3 as any, null);
		expect(data3.i).toBeNull();
		expect(JSON.parse(lastFetchInit().body as string)).toEqual({ a: 1, i: null });

		iMock.value = null;
		const data4: Record<string, unknown> = { a: 1 };
		fetchMock.mockResponseOnce('{}');
		await misskeyApi('meta', data4 as any);
		expect('i' in data4).toBe(false);
		expect(JSON.parse(lastFetchInit().body as string)).toEqual({ a: 1 });
	});

	test('POST の送り方 (URL、credentials、cache、ヘッダー、signal)', async () => {
		const controller = new AbortController();
		fetchMock.mockResponseOnce('{}');
		await misskeyApi('notes/show', { noteId: 'x' }, undefined, controller.signal);
		expect(lastFetchUrl()).toBe(`${apiUrl}/notes/show`);
		const init = lastFetchInit();
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('omit');
		expect(init.cache).toBe('no-cache');
		expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
		expect(init.signal).toBe(controller.signal);
	});

	test('中断は fetch が投げた例外で reject', async () => {
		const controller = new AbortController();
		controller.abort();
		const base = pendingApiRequestsCount.value;
		const promise = misskeyApi('meta', {}, undefined, controller.signal);
		await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
		expect(pendingApiRequestsCount.value).toBe(base);
	});
});

describe('misskeyApiGet の互換', () => {
	describe('reject 値の規則', () => {
		rejectCases(() => misskeyApiGet('meta', {}));
	});

	test('エンドポイント名を検査しない', async () => {
		// POST の検査を GET にも適用すると、従来どおり URL の一部として送れなくなる。
		fetchMock.mockResponseOnce('{}');
		await expect(misskeyApiGet('https://x' as any, {})).resolves.toEqual({});
		expect(lastFetchUrl()).toBe(`${apiUrl}/https://x?`);
	});

	test('params をクエリ文字列にできなければ同期的に throw', () => {
		// Symbol の文字列化を失敗させ、Promise を返す前に例外を捕まえられることを確かめる。
		expect(() => misskeyApiGet('meta', { s: Symbol('x') } as any)).toThrow(TypeError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('params の値は1回だけ文字列化する', async () => {
		let n = 0;
		const data = { span: 'day', get limit() { return ++n; } };
		fetchMock.mockResponseOnce('[]');
		await misskeyApiGet('charts/active-users', data as any);
		expect(lastFetchUrl()).toBe(`${apiUrl}/charts/active-users?span=day&limit=1`);
		expect(n).toBe(1);
	});

	test('GET の送り方 (クエリ文字列、認証情報なし、cache: default)', async () => {
		iMock.value = { token: 'TOKEN' };
		const data = { span: 'day' as const, limit: 10 };
		fetchMock.mockResponseOnce('[]');
		await expect(misskeyApiGet('charts/active-users', data)).resolves.toEqual([]);
		expect(lastFetchUrl()).toBe(`${apiUrl}/charts/active-users?span=day&limit=10`);
		const init = lastFetchInit();
		expect(init.method).toBe('GET');
		expect(init.credentials).toBe('omit');
		expect(init.cache).toBe('default');
		expect(init.body).toBeUndefined();
		expect(data).toEqual({ span: 'day', limit: 10 });
	});
});
