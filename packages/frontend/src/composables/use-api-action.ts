/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * 1回のユーザー操作で1つの API を呼ぶための composable。
 *
 * ## API を呼ぶ入口の選び方 (上から順に見て、最初に当てはまったものを使う)
 *
 * 1. その用途の composable・関数・専用の部品が既にある → それを使う
 *    (リモートの照会、`Paginator` / `MkPagination` の一覧、既存のアップローダーなど)
 * 2. 失敗を reject で受ける前提の相手に渡す (`useForm` の保存関数など)、
 *    または1回の操作で複数の API を順に呼び、途中で失敗したら後続を止める → `os.apiWithDialog`
 *    (手続き全体に1つの待機表示を付けるなら `os.promiseDialog` と `misskeyApi` を組み合わせる)
 * 3. 画面が1つの API の取得結果・失敗・再取得を状態として持つ → `useApiQuery` (GET でキャッシュを効かせるなら `useApiGetQuery`)
 * 4. 1回のユーザー操作で1つの API を呼ぶ (ボタン、メニュー項目、ドロップ、入力の確定など。
 *    コンポーネントの外の関数から呼ぶものを含む) → `useApiAction` (このファイル)
 * 5. どれにも当てはまらない (初期化や描画の処理が取得と成否をまとめて引き受ける、複数の取得をまとめて1つの表示に反映する、
 *    入力のたびの自動保存、バックグラウンドの処理) → `misskeyApi` / `misskeyApiGet`。失敗時の扱いは呼び元が決めて書く
 *
 * 実行中の見せ方: 画面に示す場所があれば `isPending` を使う (既定)。メニュー項目などで示す場所がなければ `waitingDialog` を付ける。
 *
 * ## `await` の意味
 *
 * - `await os.apiWithDialog(...)` が次の行に進んだら成功している。
 * - `await execute(...)` が次の行に進んでも成功とは限らない。成功 (`success`)・失敗 (`failure`)・実行中で送らなかった (`busy`) のどれかが値で返る。
 *   成功後に処理を続けるなら、戻り値の `status` で分岐するか `onSuccess` を使う。
 * - `execute` の Promise が解決した時点で約束されるのは、API の成否が決まったこと、コールバックが呼ばれたこと (完了は待たない)、
 *   失敗の既定の案内の表示が始まっていること (閉じられるのは待たない) だけ。
 * - `execute` は reject しないので、失敗を reject で受ける前提の相手には渡さない (規則2)。
 *
 * ## どこから作れるか
 *
 * effect scope (コンポーネントの setup など) の中で作ると、scope の破棄後に完了した呼び出しでは `onSuccess` / `onError` を呼ばない
 * (リクエストは中断せず、失敗の既定の案内は出す)。scope の外 (メニューを組み立てる関数など) で作ると破棄の扱いがないだけで、
 * コールバックは常に呼ばれる。その場合、画面の状態に触れるコールバックを書かないのは呼び元の責任。
 * 二重実行の防止が効くのは、同じ `useApiAction` の戻り値を使い回している範囲だけ。
 */

import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import * as os from '@/os.js';
import { requestApi } from '@/utility/api/request.js';
import { resolveApiGuidance } from '@/utility/api/guidance.js';
import { showApiGuidanceDialog } from '@/utility/api/guidance-dialog.js';
import { reportApiCallbackError } from '@/utility/api/report-error.js';
import type * as Misskey from 'misskey-js';
import type { Ref } from 'vue';
import type { ApiFailure, ApiResult } from '@/utility/api/request.js';
import type { ApiErrorOverrides } from '@/utility/api/guidance.js';

// TODO(api-error-types): Task 7 の `@/utility/api/types.js` の `JsonEndpoint` / `ApiResponse` に差し替える (仮置き)
type JsonEndpoint = keyof Misskey.Endpoints;
type ApiResponse<E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']> = unknown;

export type ApiActionResult<T> =
	| { status: 'success'; data: T }
	| { status: 'failure'; failure: ApiFailure }
	| { status: 'busy' };

export type UseApiActionOptions<E, P, T> = {
	/** 成功時に呼ぶ。返した Promise は待たない (reject は報告する) */
	onSuccess?: (data: T, params: P) => unknown;
	/**
	 * 失敗時 (中断を除く) に、既定の案内より先に呼ぶ。返した Promise は待たない (reject は報告する)。
	 * `suppressDefault()` を同期的に呼ぶと既定の案内を出さない。
	 */
	onError?: (failure: ApiFailure, ctx: { suppressDefault: () => void }) => unknown;
	/** この操作でだけの案内の上書き (code をキーにする) */
	errors?: ApiErrorOverrides;
	/** 実行中に待機ダイアログを出す。`text` で文言を指定できる */
	waitingDialog?: boolean | { text?: string };
};

export type ApiActionExecuteOptions = {
	/** `misskeyApi` の第3引数と同じ。`undefined` 以外を渡すとログイン中のトークンの代わりに送る (`null` も送る) */
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

export function useApiAction<E extends JsonEndpoint>(
	endpoint: E,
	opts: UseApiActionOptions<E, Misskey.Endpoints[E]['req'], ApiResponse<E, Misskey.Endpoints[E]['req']>> = {},
): {
	execute: <P extends Misskey.Endpoints[E]['req']>(params: P, callOpts?: ApiActionExecuteOptions) => Promise<ApiActionResult<ApiResponse<E, P>>>;
	isPending: Readonly<Ref<boolean>>;
} {
	const pending = ref(false);
	let disposed = false;

	// scope の外 (メニューを組み立てる関数など) で作った場合は破棄の扱いがない
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
		// 失敗の案内はこの composable が出すので、待機ダイアログ側では何もしない
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
			// コールバックや案内の完了は待たずに解除する
			pending.value = false;
		}

		if (result.ok) {
			const data = result.data;
			if (!disposed && opts.onSuccess) {
				const onSuccess = opts.onSuccess;
				invokeCallback(() => onSuccess(data, params));
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
			// 既定の案内を止められるのは onError の同期的な実行の間だけ
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
