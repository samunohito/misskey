/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import type { ApiResult } from '@/utility/api/request.js';
import { $i } from '@/i.js';
import { requestApi } from '@/utility/api/request.js';
export const pendingApiRequestsCount = ref(0);

/** `requestApi` の結果を従来の Promise に変換し、失敗時は元の値 `raw` で reject する。 */
async function unwrap<T>(result: Promise<ApiResult<unknown>>): Promise<T> {
	const r = await result;
	// requestApi が知らないエンドポイント別の応答型は、この関数の呼び元が指定する。
	if (r.ok) return r.data as T;
	throw r.failure.raw;
}

/**
 * `Misskey.api.ApiClient.request` と同じ形式で JSON API に POST する。
 *
 * @param data 認証トークンが指定されている場合やログイン中は、渡されたオブジェクトの `i` も書き換える。
 * @param token `undefined` の場合はログイン中のトークンを使う。`null` は `i` として送る。
 * @returns 成功時は本文 (HTTP 204 は `undefined`) で解決する。失敗時は API 応答の `error` または発生した例外で reject する。
 * @throws エンドポイント名に `://` が含まれる場合に同期的に throw する。
 */
export function misskeyApi<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(
	endpoint: E,
	data: P & { i?: string | null; } = {} as any,
	token?: string | null | undefined,
	signal?: AbortSignal,
): Promise<_ResT> {
	// 従来の同期 throw を保つため、検査結果を失敗の値にする requestApi より先に検査する。
	if (endpoint.includes('://')) throw new Error('invalid endpoint');

	// 呼び元が従来の副作用に依存できるよう、送信用のコピーを作る前に元の data にも i を書く。
	// 凍結済みのオブジェクトなどで書き込めない場合は、従来の Promise と同じく reject にする。
	try {
		if ($i) data.i = $i.token;
		if (token !== undefined) data.i = token;
	} catch (err) {
		return Promise.reject(err);
	}

	return unwrap<_ResT>(requestApi(endpoint, data as Record<string, unknown>, { method: 'POST', token, signal }));
}

/**
 * JSON API に GET し、ブラウザの既定のキャッシュ設定を使う。
 *
 * @param data クエリ文字列に変換する値。認証トークンの補完は行わない。
 * @returns 成功時は本文 (HTTP 204 は `undefined`) で解決する。失敗時は API 応答の `error` または発生した例外で reject する。
 * @throws `data` をクエリ文字列に変換できない場合に同期的に throw する。
 */
export function misskeyApiGet<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(
	endpoint: E,
	data: P = {} as any,
): Promise<_ResT> {
	// 従来の同期 throw を保つため、requestApi が失敗を値にする前に変換を試す。
	// 実行中カウンタを増やす前に試すことで、変換の失敗でカウンタが増えたままになるのを防ぐ。
	new URLSearchParams(data as any);

	return unwrap<_ResT>(requestApi(endpoint, data as Record<string, unknown>, { method: 'GET' }));
}
