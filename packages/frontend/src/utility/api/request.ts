/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
import { pendingApiRequestsCount } from '@/utility/misskey-api.js';

/** API のエラー応答のうち、`code`・`id`・`message` を文字列として確認できた本文。 */
export type ApiErrorBody = {
	code: string;
	id: string;
	message: string;
	kind?: string;
	info?: Record<string, unknown>;
};

/**
 * API 呼び出しの失敗を、案内や中断の判定に使う種類ごとに表す。
 * `raw` は失敗の元の値を保持する。API 応答の `error` や例外が入り、`undefined` の場合もある。
 */
export type ApiFailure =
	| { kind: 'api'; error: ApiErrorBody; raw: unknown }
	| { kind: 'network'; raw: unknown }
	| { kind: 'invalid-response'; raw: unknown }
	| { kind: 'aborted'; raw: unknown }
	| { kind: 'other'; raw: unknown };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

export type RequestApiOptions = {
	/** 省略時は POST。GET はトークンを補わず、ブラウザの既定のキャッシュ設定を使う。 */
	method?: 'POST' | 'GET';
	/** POST のみ。`undefined` 以外を渡すとログイン中のトークンに優先する (`null` も送る)。 */
	token?: string | null;
	/** 送信や応答本文の読み取りを中断する。 */
	signal?: AbortSignal;
};

/** エラー本文の必須項目が文字列かを判定する。任意項目の `kind` と `info` は検査しない。 */
export function isApiErrorBody(x: unknown): x is ApiErrorBody {
	if (typeof x !== 'object' || x == null) return false;
	const body = x as Record<string, unknown>;
	return typeof body.code === 'string' && typeof body.id === 'string' && typeof body.message === 'string';
}

function buildRequest(endpoint: string, params: Record<string, unknown>, opts: RequestApiOptions): [string, RequestInit] {
	if (opts.method === 'GET') {
		// 値の文字列化は URLSearchParams に任せ、misskeyApiGet と同じ変換規則を使う。
		const query = new URLSearchParams(params as Record<string, string>);
		return [`${apiUrl}/${endpoint}?${query}`, {
			method: 'GET',
			credentials: 'omit',
			cache: 'default',
			signal: opts.signal,
		}];
	}

	// misskeyApi と misskeyApiGet に合わせ、`://` を含む名前の検査は POST に限る。
	if (endpoint.includes('://')) throw new Error('invalid endpoint');

	// 認証用の i の補完が呼び元の params に及ばないよう、送信用の本文を作る。
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
 * JSON API を呼び、成功または種類つきの失敗で非同期に解決する。
 * リクエストの組み立て・送信・応答の失敗は `failure` に入るため、API 呼び出しの失敗で reject しない。
 * HTTP 204 は `data` が `undefined` の成功として扱う。
 *
 * @param params POST では本文、GET ではクエリに使う。呼び元の値は変更しない。
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

	let url: string;
	let init: RequestInit;
	try {
		[url, init] = buildRequest(endpoint, params, opts);
	} catch (err) {
		return fail({ kind: 'other', raw: err });
	}

	// 中断を優先するのは fetch または res.json() が失敗したときだけ。
	// 読み取れた応答は、中断の後に届いても応答どおりに扱う。
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

	// 失敗の元の値として、body.error と、その参照自体が失敗したときの例外を raw に残す。
	let raw: unknown;
	try {
		raw = (body as { error?: unknown }).error;
	} catch (err) {
		return fail({ kind: 'invalid-response', raw: err });
	}

	if (isApiErrorBody(raw)) return fail({ kind: 'api', error: raw, raw });
	return fail({ kind: 'invalid-response', raw });
}
