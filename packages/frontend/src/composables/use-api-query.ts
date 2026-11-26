/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import type { Ref } from 'vue';
import type { ApiFailure, ApiResult } from '@/utility/api/request.js';
import type { ApiErrorOverrides, ApiGuidance } from '@/utility/api/guidance.js';
import type { Cloneable } from '@/utility/clone.js';
import type { ApiResponse, JsonEndpoint } from '@/utility/api/types.js';
import { deepEqual } from '@/utility/deep-equal.js';
import { deepClone } from '@/utility/clone.js';
import { reportApiCallbackError } from '@/utility/api/report-error.js';
import { resolveApiGuidanceSync } from '@/utility/api/guidance.js';
import { requestApi } from '@/utility/api/request.js';

export type ApiQueryError = { guidance: ApiGuidance; failure: ApiFailure };

export type UseApiQueryOptions<E extends string, P, T> = {
	/** 取得条件を返す。入れ子まで監視する。有効時に評価が throw すると `error` に `other` の失敗を入れる。 */
	params?: () => P;
	/**
	 * 真の間だけ取得する。偽になると進行中の取得を中断して `data` と `error` を消す。
	 * 省略時は常に真。評価が throw すると `error` に `other` の失敗を入れる。
	 */
	enabled?: () => boolean;
	/**
	 * 監視で有効になった時点に取得条件も評価できていれば、一度だけ呼ぶ。
	 * `undefined` 以外を返すと `data` に採用し、その回の取得を省く。
	 * 有効な状態で先に `refetch()` を呼んだ場合は使わない。throw したら報告して `undefined` と同じ扱いにする。
	 */
	initialData?: () => T | undefined;
	/** 真なら `refetch()` でだけ取得する。取得条件と対象の変化は引き続き監視する。 */
	manual?: boolean;
	/** この取得で使うエラー案内を `code` ごとに上書きする。 */
	errors?: ApiErrorOverrides<E>;
};

export type UseApiQueryReturn<T> = {
	/** 現在の取得条件に対応するデータ。書き換えでき、同じ条件での再取得中は直前の値を保持する。 */
	data: Ref<T | undefined>;
	/** 取得や条件の評価の失敗。中断時は案内を出す必要がないため失敗として保持しない。 */
	error: Readonly<Ref<ApiQueryError | null>>;
	isPending: Readonly<Ref<boolean>>;
	/**
	 * 現在の条件で取得する。取得の終了・置き換え・中断で解決し、取得の失敗は `error` に反映する。
	 * 無効時や scope の破棄後は送信せずに解決する。
	 */
	refetch: () => Promise<void>;
};

type EvalResult<V> = { ok: true; value: V } | { ok: false; error: unknown };

type JsonLike = Parameters<typeof deepEqual>[0];

function snapshotOf(params: unknown): JsonLike {
	// JSON API の params を複製可能な値として扱い、比較用の型に合わせる。
	return deepClone(params as Cloneable) as JsonLike;
}

function useQuery<P, T>(method: 'POST' | 'GET', endpoint: string, opts: UseApiQueryOptions<string, P, T>): UseApiQueryReturn<T> {
	// Vue が型に適用する Ref のアンラップを避け、呼び出し元の応答型 T を公開する。
	const data = ref<T>() as Ref<T | undefined>;
	const error = ref<ApiQueryError | null>(null);
	const pending = ref(false);

	// abort だけでは受信済みの応答を取り消せないため、世代番号でも結果の反映を制御する。
	let generation = 0;
	let controller: AbortController | null = null;
	let settleInflight: (() => void) | null = null;
	// 最後に評価した条件、通信中の条件、表示中データの条件はずれることがあるため個別に追跡する。
	let inflightParams: { value: JsonLike } | null = null;
	let dataParams: { value: JsonLike } | null = null;
	let seenParams: { value: JsonLike } | null = null;
	let wasEnabled = false;
	let initialDataChecked = false;
	let disposed = false;

	function evaluateParams(): EvalResult<P> {
		try {
			return { ok: true, value: (opts.params ? opts.params() : {}) as P };
		} catch (err) {
			return { ok: false, error: err };
		}
	}

	function evaluateEnabled(): EvalResult<boolean> {
		try {
			return { ok: true, value: opts.enabled?.() ?? true };
		} catch (err) {
			return { ok: false, error: err };
		}
	}

	function evaluateInitialData(): T | undefined {
		try {
			return opts.initialData?.();
		} catch (err) {
			reportApiCallbackError(err);
			return undefined;
		}
	}

	function toQueryError(failure: ApiFailure): ApiQueryError | null {
		const guidance = resolveApiGuidanceSync(endpoint, failure, { overrides: opts.errors });
		return guidance == null ? null : { guidance, failure };
	}

	function abortInflight(): void {
		// 中断で応答が返ってきても反映されないよう、先に世代を進める。
		generation++;
		const c = controller;
		const settle = settleInflight;
		controller = null;
		settleInflight = null;
		inflightParams = null;
		c?.abort();
		// 通信側の中断処理を待たずに、この取得を待っている refetch() を解決する。
		settle?.();
	}

	function cancelInflight(): void {
		abortInflight();
		pending.value = false;
	}

	function clearData(): void {
		data.value = undefined;
		dataParams = null;
	}

	function failEvaluation(err: unknown): void {
		// 現在の対象を確認できないため、前の条件の通信と表示データも無効にする。
		cancelInflight();
		clearData();
		seenParams = null;
		error.value = toQueryError({ kind: 'other', raw: err });
	}

	function startFetch(params: P): Promise<void> {
		cancelInflight();
		const myGeneration = generation;
		const snapshot = { value: snapshotOf(params) };
		seenParams = snapshot;

		error.value = null;
		if (dataParams == null || !deepEqual(dataParams.value, snapshot.value)) clearData();

		const ac = new AbortController();
		controller = ac;
		inflightParams = snapshot;
		pending.value = true;

		return new Promise<void>((resolve) => {
			settleInflight = resolve;
			// 送信する値を呼び元や比較に使う複製から独立させ、認証情報の補完を取得条件に混ぜない。
			requestApi<T>(endpoint, snapshotOf(params) as Record<string, unknown>, { method, signal: ac.signal })
				// requestApi は reject しない約束だが、万一の reject も失敗として扱う
				.catch((err: unknown): ApiResult<never> => ({ ok: false, failure: { kind: 'other', raw: err } }))
				.then((result) => {
					if (myGeneration !== generation) return;
					controller = null;
					settleInflight = null;
					inflightParams = null;
					pending.value = false;
					if (result.ok) {
						data.value = result.data;
						dataParams = snapshot;
					} else {
						error.value = toQueryError(result.failure);
					}
					resolve();
				});
		});
	}

	function onSourceChange(enabledResult: EvalResult<boolean>, paramsResult: EvalResult<P>): void {
		if (disposed) return;

		if (!enabledResult.ok) {
			// 評価できるようになった時点で、真になったものとして取り直す
			wasEnabled = false;
			failEvaluation(enabledResult.error);
			return;
		}

		if (!enabledResult.value) {
			cancelInflight();
			clearData();
			error.value = null;
			wasEnabled = false;
			return;
		}

		const becameEnabled = !wasEnabled;
		wasEnabled = true;

		if (!paramsResult.ok) {
			failEvaluation(paramsResult.error);
			return;
		}

		const snapshot = { value: snapshotOf(paramsResult.value) };
		const changed = seenParams == null || !deepEqual(seenParams.value, snapshot.value);
		seenParams = snapshot;

		if (becameEnabled && !initialDataChecked) {
			initialDataChecked = true;
			const initial = evaluateInitialData();
			if (initial !== undefined) {
				data.value = initial;
				dataParams = snapshot;
				error.value = null;
				return;
			}
		}

		if (!opts.manual) {
			if (becameEnabled || changed) void startFetch(paramsResult.value);
			return;
		}

		// 手動取得でも、条件が変わった画面に前の対象のデータ・エラー・応答を出さないようにする。
		if (changed) error.value = null;
		if (dataParams != null && !deepEqual(dataParams.value, snapshot.value)) clearData();
		if (inflightParams != null && !deepEqual(inflightParams.value, snapshot.value)) cancelInflight();
	}

	function refetch(): Promise<void> {
		if (disposed) return Promise.resolve();
		const enabledResult = evaluateEnabled();
		if (!enabledResult.ok) {
			wasEnabled = false;
			failEvaluation(enabledResult.error);
			return Promise.resolve();
		}
		if (!enabledResult.value) return Promise.resolve();

		// 監視が条件の変化を拾う前に呼ばれた場合も、ここで真になったものとして扱う (二重の取得と初期値の採用を避ける)
		wasEnabled = true;
		initialDataChecked = true;

		const paramsResult = evaluateParams();
		if (!paramsResult.ok) {
			failEvaluation(paramsResult.error);
			return Promise.resolve();
		}
		return startFetch(paramsResult.value);
	}

	if (getCurrentScope()) {
		onScopeDispose(() => {
			// 破棄前に渡した refetch() からの送信も止める。
			disposed = true;
			abortInflight();
		}, true);
	}

	watch(
		() => [evaluateEnabled(), evaluateParams()] as const,
		([enabledResult, paramsResult]) => onSourceChange(enabledResult, paramsResult),
		{ deep: true, immediate: true },
	);

	return {
		data,
		error: computed(() => error.value),
		isPending: computed(() => pending.value),
		refetch,
	};
}

/**
 * POST で取得したデータと失敗を画面の状態として管理する。
 * 既定では有効になったときと取得条件が変わったときに取得する。失敗はダイアログを出さず `error` に入る。
 * `setup` などの effect scope 内で呼ぶ。scope の破棄時に監視を終了し、進行中の取得を中断する。
 */
export function useApiQuery<E extends JsonEndpoint, P extends Misskey.Endpoints[E]['req']>(
	endpoint: E,
	opts: UseApiQueryOptions<E, P, ApiResponse<E, P>> = {},
): UseApiQueryReturn<ApiResponse<E, P>> {
	return useQuery('POST', endpoint, opts);
}

/** GET で取得する `useApiQuery`。ブラウザの既定のキャッシュ設定を使い、認証トークンは補完しない。 */
// TODO(api-error-types): GET 可能な24件に絞る
export function useApiGetQuery<E extends JsonEndpoint, P extends Misskey.Endpoints[E]['req']>(
	endpoint: E,
	opts: UseApiQueryOptions<E, P, ApiResponse<E, P>> = {},
): UseApiQueryReturn<ApiResponse<E, P>> {
	return useQuery('GET', endpoint, opts);
}
