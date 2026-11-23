/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { ref } from 'vue';
import { $i } from '@/i.js';
import { requestApi } from '@/utility/api/request.js';
import type { ApiResult } from '@/utility/api/request.js';
export const pendingApiRequestsCount = ref(0);

// requestApi の結果を、従来の misskeyApi / misskeyApiGet と同じ値で resolve / reject する形に戻す
async function unwrap<T>(result: Promise<ApiResult<unknown>>): Promise<T> {
	const r = await result;
	if (r.ok) return r.data as T;
	throw r.failure.raw;
}

// Implements Misskey.api.ApiClient.request
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
	// requestApi も同じ検査をするが、そちらは失敗の値 (kind: 'other') として返す。
	// 従来の misskeyApi は同期的に throw していたので、互換のためここで先に検査して throw する
	if (endpoint.includes('://')) throw new Error('invalid endpoint');

	// Append a credential
	// 渡された data に i を書き込むのは従来の挙動 (呼び元が依存している可能性があるので残す)。
	// requestApi は呼び元の params を書き換えず、浅いコピーに同じ規則で i を書くので、送る値は変わらない
	// 書き込みの失敗 (data が凍結済み・null など) は、従来どおり同期的に throw せず reject にする
	try {
		if ($i) data.i = $i.token;
		if (token !== undefined) data.i = token;
	} catch (err) {
		return Promise.reject(err);
	}

	return unwrap<_ResT>(requestApi(endpoint, data as Record<string, unknown>, { method: 'POST', token, signal }));
}

// Implements Misskey.api.ApiClient.request
export function misskeyApiGet<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(
	endpoint: E,
	data: P = {} as any,
): Promise<_ResT> {
	// クエリ文字列にできない params は、従来どおり同期的に throw する。
	// requestApi に任せると失敗の値 (kind: 'other') になって reject に変わるので、互換のためここで先に変換を試す。
	// 実行中カウンタ (pendingApiRequestsCount) を増やす前に throw するので、従来のようにカウンタが +1 のまま残ることはない
	new URLSearchParams(data as any);

	return unwrap<_ResT>(requestApi(endpoint, data as Record<string, unknown>, { method: 'GET' }));
}
