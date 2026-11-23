/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import type { Ref } from 'vue';
import type { ApiFailure, ApiResult } from '@/utility/api/request.js';
import type { ApiErrorOverrides } from '@/utility/api/guidance.js';
import type { ApiResponse, JsonEndpoint } from '@/utility/api/types.js';
import * as os from '@/os.js';
import { requestApi } from '@/utility/api/request.js';
import { resolveApiGuidance } from '@/utility/api/guidance.js';
import { showApiGuidanceDialog } from '@/utility/api/guidance-dialog.js';
import { reportApiCallbackError } from '@/utility/api/report-error.js';

/** 操作の実行結果。`busy` は同じ操作の実行中につき送信を見送ったことを表す。 */
export type ApiActionResult<T> =
	| { status: 'success'; data: T }
	| { status: 'failure'; failure: ApiFailure }
	| { status: 'busy' };

export type UseApiActionOptions<E, P, T> = {
	/** 成功時に呼ぶ。同期例外や返した Promise の reject は報告し、完了は待たない。 */
	onSuccess?: (data: T, params: P) => unknown;
	/**
	 * 失敗時 (中断を除く) に、既定の案内より先に呼ぶ。同期例外や返した Promise の reject は報告し、完了は待たない。
	 * `suppressDefault()` を同期的に呼ぶと既定の案内を出さない。
	 */
	onError?: (failure: ApiFailure, ctx: { suppressDefault: () => void }) => unknown;
	/** この操作で使うエラー案内を `code` ごとに上書きする。 */
	errors?: ApiErrorOverrides;
	/** 実行中に待機ダイアログを出す。`text` で文言を指定できる。既定では表示しない。 */
	waitingDialog?: boolean | { text?: string };
};

export type ApiActionExecuteOptions = {
	/** `misskeyApi` の第3引数と同じ。`undefined` 以外を渡すとログイン中のトークンに優先する (`null` も送る)。 */
	token?: string | null;
};

/** コールバックを呼び、同期の例外も返した Promise の reject も報告する。完了は待たない */
function invokeCallback(fn: () => unknown): void {
	try {
		const r = fn();
		if (r instanceof Promise) r.catch(reportApiCallbackError);
	} catch (err) {
		reportApiCallbackError(err);
	}
}

/**
 * 1回のユーザー操作から1つの API に POST する処理を作る。
 * effect scope 内で作ると、破棄後に完了した処理のコールバックは呼ばない。リクエストは続行し、失敗時は既定の案内を出す。
 * メニューを組み立てる関数など、scope の外でも作成できる。
 *
 * @returns `execute` と、そのインスタンスの実行状態。`execute` は API の成否を値で返し、失敗でも reject しない。
 * 実行中に再度呼ぶと `busy` で解決する。中断は案内を出さず `failure` で返す。
 * コールバックの完了や案内が閉じるのは待たない。
 */
export function useApiAction<E extends JsonEndpoint>(
	endpoint: E,
	opts: UseApiActionOptions<E, Misskey.Endpoints[E]['req'], ApiResponse<E, Misskey.Endpoints[E]['req']>> = {},
): {
	execute: <P extends Misskey.Endpoints[E]['req']>(params: P, callOpts?: ApiActionExecuteOptions) => Promise<ApiActionResult<ApiResponse<E, P>>>;
	isPending: Readonly<Ref<boolean>>;
} {
	const pending = ref(false);
	let disposed = false;

	// 破棄した画面の状態をコールバックが更新しないようにする。操作の成否を得るため、送信は継続する。
	if (getCurrentScope()) {
		onScopeDispose(() => {
			disposed = true;
		}, true);
	}

	function openWaitingDialog(): ((result: ApiResult<unknown>) => void) | null {
		if (!opts.waitingDialog) return null;
		const text = typeof opts.waitingDialog === 'object' ? opts.waitingDialog.text : undefined;

		let settle!: (result: ApiResult<unknown>) => void;
		const p = new Promise<unknown>((resolve, reject) => {
			settle = (result) => {
				if (result.ok) resolve(result.data);
				else reject(result.failure);
			};
		});
		// ダイアログを開けなかった場合も未処理の reject を防ぐ。失敗の案内は execute に任せ、二重に表示しない。
		p.catch(() => {});
		try {
			os.promiseDialog(p, null, () => {}, text);
		} catch (err) {
			reportApiCallbackError(err);
		}
		return settle;
	}

	function showDefaultGuidance(failure: ApiFailure): void {
		try {
			const guidance = resolveApiGuidance(endpoint, failure, { overrides: opts.errors });
			if (guidance == null) return;
			showApiGuidanceDialog(guidance).catch(reportApiCallbackError);
		} catch (err) {
			reportApiCallbackError(err);
		}
	}

	async function execute<P extends Misskey.Endpoints[E]['req']>(params: P, callOpts: ApiActionExecuteOptions = {}): Promise<ApiActionResult<ApiResponse<E, P>>> {
		if (pending.value) return { status: 'busy' };
		pending.value = true;

		let result: ApiResult<ApiResponse<E, P>>;
		try {
			const settleWaiting = openWaitingDialog();
			// requestApi は reject しない約束だが、万一の reject も失敗として扱い、execute を reject させない
			result = await requestApi<ApiResponse<E, P>>(endpoint, params as Record<string, unknown>, { method: 'POST', token: callOpts.token })
				.catch((err: unknown): ApiResult<never> => ({ ok: false, failure: { kind: 'other', raw: err } }));
			settleWaiting?.(result);
		} finally {
			// API の実行中だけを示すため、コールバックや案内を起動する前に解除する。
			pending.value = false;
		}

		if (result.ok) {
			const data = result.data;
			if (!disposed && opts.onSuccess) {
				const onSuccess = opts.onSuccess;
				// `ApiResponse<E, P>` は `ApiResponse<E, req>` に含まれるが、型パラメータのままでは TS が示せないので広げる
				invokeCallback(() => onSuccess(data as ApiResponse<E, Misskey.Endpoints[E]['req']>, params));
			}
			return { status: 'success', data };
		}

		const failure = result.failure;
		if (failure.kind === 'aborted') return { status: 'failure', failure };

		let suppressed = false;
		if (!disposed && opts.onError) {
			const onError = opts.onError;
			let acceptsSuppress = true;
			invokeCallback(() => onError(failure, {
				suppressDefault: () => {
					if (acceptsSuppress) suppressed = true;
				},
			}));
			// onError の非同期処理を待たずに表示を決めるため、抑止はここで締め切る。
			acceptsSuppress = false;
		}

		if (!suppressed) showDefaultGuidance(failure);

		return { status: 'failure', failure };
	}

	return {
		execute,
		isPending: computed(() => pending.value),
	};
}
