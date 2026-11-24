/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { apiUrl } from '@@/js/config.js';
import { isApiErrorBody, requestApi } from '@/utility/api/request.js';
import { pendingApiRequestsCount } from '@/utility/misskey-api.js';

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

function abortError() {
	return new DOMException('The operation was aborted.', 'AbortError');
}

beforeEach(() => {
	fetchMock.resetMocks();
	// resetMocks() 後も setup.unit.ts の locale 用の絞り込みが残るため、API の fetch も差し替え対象にする。
	fetchMock.doMock();
	iMock.value = null;
});

afterEach(() => {
	iMock.value = null;
});

describe('requestApi', () => {
	test('200 は ok と本文', async () => {
		fetchMock.mockResponseOnce('{"a":1}');
		await expect(requestApi('meta', {})).resolves.toEqual({ ok: true, data: { a: 1 } });
	});

	test('204 は ok と undefined', async () => {
		fetchMock.mockResponseOnce('', { status: 204 });
		await expect(requestApi('i/update', {})).resolves.toEqual({ ok: true, data: undefined });
	});

	test('エラー応答の error が API エラーの構造なら kind: api', async () => {
		const error = { code: 'NO_SUCH_USER', id: 'x', message: 'm' };
		fetchMock.mockResponseOnce(JSON.stringify({ error }), { status: 400 });
		const result = await requestApi('users/show', {});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.kind).toBe('api');
		if (result.failure.kind !== 'api') return;
		expect(result.failure.error.code).toBe('NO_SUCH_USER');
		expect(result.failure.raw).toEqual(error);
	});

	test.each([
		['error がない', '{}', undefined],
		['error が null', '{"error":null}', null],
		['error が {}', '{"error":{}}', {}],
	])('%s は invalid-response', async (_, body, raw) => {
		fetchMock.mockResponseOnce(body, { status: 500 });
		const result = await requestApi('meta', {});
		expect(result).toEqual({ ok: false, failure: { kind: 'invalid-response', raw } });
	});

	test('エラー応答の本文が null なら invalid-response で、raw は本文の参照で起きる TypeError', async () => {
		fetchMock.mockResponseOnce('null', { status: 500 });
		const result = await requestApi('meta', {});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.kind).toBe('invalid-response');
		expect(result.failure.raw).toBeInstanceOf(TypeError);
	});

	test('本文が JSON でなければ invalid-response', async () => {
		fetchMock.mockResponseOnce('<html>', { status: 200 });
		const result = await requestApi('meta', {});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.kind).toBe('invalid-response');
		expect(result.failure.raw).toBeInstanceOf(SyntaxError);
	});

	test('fetch 自体の失敗は network', async () => {
		const err = new TypeError('Failed to fetch');
		fetchMock.mockRejectOnce(err);
		await expect(requestApi('meta', {})).resolves.toEqual({ ok: false, failure: { kind: 'network', raw: err } });
	});

	test('signal で中断したら aborted (fetch 中)', async () => {
		const controller = new AbortController();
		// AbortError 以外でも signal の状態を優先することを確かめる。
		const err = new TypeError('Failed to fetch');
		fetchMock.mockImplementationOnce(async () => {
			controller.abort();
			throw err;
		});
		const result = await requestApi('meta', {}, { signal: controller.signal });
		expect(result).toEqual({ ok: false, failure: { kind: 'aborted', raw: err } });
	});

	test('中断済みの signal で呼んでも aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await requestApi('meta', {}, { signal: controller.signal });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.kind).toBe('aborted');
	});

	test('本文の読み取り中に中断しても aborted', async () => {
		const controller = new AbortController();
		const err = abortError();
		// 本文の読み取りで中断するため、status と json() だけを持つ応答を unknown 経由で渡す。
		fetchMock.mockImplementationOnce(async () => ({
			status: 200,
			json: async () => {
				controller.abort();
				throw err;
			},
		}) as unknown as Response);
		const result = await requestApi('meta', {}, { signal: controller.signal });
		expect(result).toEqual({ ok: false, failure: { kind: 'aborted', raw: err } });
	});

	test('エンドポイント名に :// を含むと other (throw しない)', async () => {
		const promise = requestApi('https://example.com/api/meta', {});
		const result = await promise;
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.kind).toBe('other');
		expect(result.failure.raw).toBeInstanceOf(Error);
		expect((result.failure.raw as Error).message).toBe('invalid endpoint');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('params を JSON にできなければ other (throw しない)', async () => {
		const result = await requestApi('meta', { n: 1n });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.kind).toBe('other');
		expect(result.failure.raw).toBeInstanceOf(TypeError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('GET はクエリ文字列で送り、credentials は omit、cache は default', async () => {
		iMock.value = { token: 'TOKEN' };
		fetchMock.mockResponseOnce('[]');
		await expect(requestApi('charts/active-users', { span: 'day', limit: 10 }, { method: 'GET' })).resolves.toEqual({ ok: true, data: [] });
		expect(lastFetchUrl()).toBe(`${apiUrl}/charts/active-users?span=day&limit=10`);
		const init = lastFetchInit();
		expect(init.method).toBe('GET');
		expect(init.credentials).toBe('omit');
		expect(init.cache).toBe('default');
		expect(init.body).toBeUndefined();
	});

	test('GET で params をクエリ文字列にできなければ other (throw しない)', async () => {
		const result = await requestApi('meta', { s: Symbol('x') }, { method: 'GET' });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.failure.kind).toBe('other');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('POST は $i があれば i を付け、token 指定 (null を含む) で上書きし、呼び元の params を書き換えない', async () => {
		iMock.value = { token: 'TOKEN' };

		const params: Record<string, unknown> = { a: 1 };
		fetchMock.mockResponseOnce('{}');
		await requestApi('meta', params);
		expect(lastFetchUrl()).toBe(`${apiUrl}/meta`);
		const init = lastFetchInit();
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('omit');
		expect(init.cache).toBe('no-cache');
		expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
		expect(JSON.parse(init.body as string)).toEqual({ a: 1, i: 'TOKEN' });
		expect(params).toEqual({ a: 1 });

		fetchMock.mockResponseOnce('{}');
		await requestApi('meta', params, { token: 'OTHER' });
		expect(JSON.parse(lastFetchInit().body as string)).toEqual({ a: 1, i: 'OTHER' });

		fetchMock.mockResponseOnce('{}');
		await requestApi('meta', params, { token: null });
		expect(JSON.parse(lastFetchInit().body as string)).toEqual({ a: 1, i: null });
		expect(params).toEqual({ a: 1 });

		iMock.value = null;
		fetchMock.mockResponseOnce('{}');
		await requestApi('meta', params);
		expect(JSON.parse(lastFetchInit().body as string)).toEqual({ a: 1 });
	});

	test('pendingApiRequestsCount を開始で1増やし、終了 (失敗・中断を含む) で戻す', async () => {
		const base = pendingApiRequestsCount.value;

		fetchMock.mockResponseOnce('{}');
		const ok = requestApi('meta', {});
		expect(pendingApiRequestsCount.value).toBe(base + 1);
		await ok;
		expect(pendingApiRequestsCount.value).toBe(base);

		fetchMock.mockRejectOnce(new TypeError('Failed to fetch'));
		const failed = requestApi('meta', {});
		expect(pendingApiRequestsCount.value).toBe(base + 1);
		await failed;
		expect(pendingApiRequestsCount.value).toBe(base);

		const controller = new AbortController();
		controller.abort();
		const aborted = requestApi('meta', {}, { signal: controller.signal });
		expect(pendingApiRequestsCount.value).toBe(base + 1);
		await aborted;
		expect(pendingApiRequestsCount.value).toBe(base);

		await requestApi('https://example.com', {});
		expect(pendingApiRequestsCount.value).toBe(base);
	});
});

describe('isApiErrorBody', () => {
	test.each([
		[{ code: 'A', id: 'b', message: 'c' }, true],
		[{ code: 'A', id: 'b', message: 'c', kind: 'client', info: {} }, true],
		[{ code: 'A', id: 'b' }, false],
		[{ code: 1, id: 'b', message: 'c' }, false],
		[{}, false],
		[null, false],
		[undefined, false],
		['A', false],
	])('%j → %s', (x, expected) => {
		expect(isApiErrorBody(x)).toBe(expected);
	});
});
