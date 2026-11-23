/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
import { pendingApiRequestsCount } from '@/utility/misskey-api.js';

export type ApiErrorBody = {
	code: string;
	id: string;
	message: string;
	kind?: string;
	info?: Record<string, unknown>;
};

/**
 * API 呼び出しの失敗を種類で分けたもの。
 * `raw` には、`misskeyApi` / `misskeyApiGet` が従来 reject していた値をそのまま入れる。
 */
export type ApiFailure =
	| { kind: 'api'; error: ApiErrorBody; raw: unknown }
	| { kind: 'network'; raw: unknown }
	| { kind: 'invalid-response'; raw: unknown }
	| { kind: 'aborted'; raw: unknown }
	| { kind: 'other'; raw: unknown };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

export type RequestApiOptions = {
	method?: 'POST' | 'GET';
	/** POST のみ。`undefined` 以外を渡すと `$i` のトークンの代わりに送る (`null` も送る) */
	token?: string | null;
	signal?: AbortSignal;
};

export function isApiErrorBody(x: unknown): x is ApiErrorBody {
	if (typeof x !== 'object' || x == null) return false;
	const body = x as Record<string, unknown>;
	return typeof body.code === 'string' && typeof body.id === 'string' && typeof body.message === 'string';
}

function buildRequest(endpoint: string, params: Record<string, unknown>, opts: RequestApiOptions): [string, RequestInit] {
	if (opts.method === 'GET') {
		// GET は認証情報を送らず、ブラウザのキャッシュを使う
		const query = new URLSearchParams(params as Record<string, string>);
		return [`${apiUrl}/${endpoint}?${query}`, {
			method: 'GET',
			credentials: 'omit',
			cache: 'default',
			signal: opts.signal,
		}];
	}

	// 互換のため POST と GET で揃えていない: エンドポイント名の `://` 検査は POST だけで行う。
	// 従来の misskeyApi は検査し、misskeyApiGet は検査していなかった。GET でも検査すると、
	// misskeyApiGet が今まで通していたエンドポイントを拒むようになる。
	// なお misskeyApi は従来どおり同期 throw させるため、requestApi を呼ぶ前に自前でも検査している。
	if (endpoint.includes('://')) throw new Error('invalid endpoint');

	// 呼び元の params は書き換えない
	const body: Record<string, unknown> = { ...params };
	if ($i) body.i = $i.token;
	if (opts.token !== undefined) body.i = opts.token;

	return [`${apiUrl}/${endpoint}`, {
		method: 'POST',
		body: JSON.stringify(body),
		credentials: 'omit',
		cache: 'no-cache',
		headers: {
			'Content-Type': 'application/json',
		},
		signal: opts.signal,
	}];
}

/**
 * API を呼び、結果を成功か種類つきの失敗で返す。reject も同期的な throw もしない。
 */
export async function requestApi<T = unknown>(
	endpoint: string,
	params: Record<string, unknown>,
	opts: RequestApiOptions = {},
): Promise<ApiResult<T>> {
	pendingApiRequestsCount.value++;
	try {
		return await doRequest<T>(endpoint, params, opts);
	} finally {
		pendingApiRequestsCount.value--;
	}
}

async function doRequest<T>(endpoint: string, params: Record<string, unknown>, opts: RequestApiOptions): Promise<ApiResult<T>> {
	const fail = (failure: ApiFailure): ApiResult<T> => ({ ok: false, failure });
	const isAborted = () => opts.signal?.aborted === true;

	// 互換のため、abort を最優先にするのは fetch か res.json() が例外を投げたときだけにしている。
	// 応答の読み取りまで終わってから signal が abort されても、結果は ok (または api / invalid-response) のまま返す。
	// 従来の misskeyApi はこの場合 resolve しており、成功の経路でも signal.aborted を見ると reject に変わってしまう。
	let url: string;
	let init: RequestInit;
	try {
		[url, init] = buildRequest(endpoint, params, opts);
	} catch (err) {
		return fail({ kind: 'other', raw: err });
	}

	let res: Response;
	try {
		res = await window.fetch(url, init);
	} catch (err) {
		return fail({ kind: isAborted() ? 'aborted' : 'network', raw: err });
	}

	if (res.status === 204) return { ok: true, data: undefined as T };

	let body: unknown;
	try {
		body = await res.json();
	} catch (err) {
		return fail({ kind: isAborted() ? 'aborted' : 'invalid-response', raw: err });
	}

	if (res.status === 200) return { ok: true, data: body as T };

	// 従来の misskeyApi は `body.error` で reject していた。本文が null などで参照が例外になる場合は、その例外を raw にする
	let raw: unknown;
	try {
		raw = (body as { error?: unknown }).error;
	} catch (err) {
		return fail({ kind: 'invalid-response', raw: err });
	}

	if (isApiErrorBody(raw)) return fail({ kind: 'api', error: raw, raw });
	return fail({ kind: 'invalid-response', raw });
}
