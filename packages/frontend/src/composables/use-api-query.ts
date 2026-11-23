/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * 画面が1つの API の取得結果・失敗・再取得を状態として持つための composable。
 * 入口の選び方は `use-api-action.ts` の冒頭のコメントを参照。
 *
 * ## どこで使うか
 *
 * effect scope の中 (コンポーネントの setup か `effectScope()` の中) で呼ぶこと。
 * `params` / `enabled` の監視と、破棄時のリクエストの中断は scope に結びつく。
 * scope の外で呼ぶと監視が止まらず、破棄の扱いもない。
 *
 * ## 動き
 *
 * - 自動 (既定) は作成時に1回取得し、`params` が返す値 (入れ子を含む) が変わるたびに取り直す。
 *   `manual: true` なら自動では取得せず、`refetch()` でだけ取得する。
 * - 表示中の `data` が、どの `params` で取得した (または初期値として採用した) ものかを常に持つ。
 *   新しい取得の `params` がそれと同じなら `data` を残し、違えば取得開始時に消す。手動でも `params` が変わった時点で消す。
 * - `enabled` が偽の間は取得せず (`refetch()` も送らない)、進行中の取得を中断し、`data` と `error` を消す。
 * - `initialData` は `enabled` が初めて真になった時点で1回だけ採用し、その時点の取得を省く。
 * - 失敗してもダイアログは出さず、`error` (案内と分類済みの失敗) を返す。中断は `error` にしない。
 * - `refetch()` は reject しない。その取得が終わるか、置き換えられるか、中断された時点で解決する。成否は `data` / `error` で見る。
 * - `data` は書き換えてよい (表示中の対象への更新として扱い、次の取得の成功で上書きされる)。
 *   画面の非同期処理の完了で `data` を直すときは、開始時の `data` と同じ対象かを確かめてから直す (例: 開始時の `data` と同一か比べる)。
 */

import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import { requestApi } from '@/utility/api/request.js';
import { resolveApiGuidance } from '@/utility/api/guidance.js';
import { deepClone } from '@/utility/clone.js';
import { deepEqual } from '@/utility/deep-equal.js';
import type * as Misskey from 'misskey-js';
import type { Ref } from 'vue';
import type { ApiFailure, ApiResult } from '@/utility/api/request.js';
import type { ApiErrorOverrides, ApiGuidance } from '@/utility/api/guidance.js';
import type { Cloneable } from '@/utility/clone.js';
import type { ApiResponse, JsonEndpoint } from '@/utility/api/types.js';

export type ApiQueryError = { guidance: ApiGuidance; failure: ApiFailure };

export type UseApiQueryOptions<P, T> = {
	/** 取得条件を返す。返す値 (入れ子を含む) を監視する */
	params?: () => P;
	/** 真の間だけ取得する。省略時は常に真 */
	enabled?: () => boolean;
	/** 値を返したら、`enabled` が初めて真になった時点で `data` にし、その時点の取得を省く */
	initialData?: () => T | undefined;
	/** 真なら自動では取得せず、`refetch()` でだけ取得する */
	manual?: boolean;
	/** この取得でだけの案内の上書き (code をキーにする) */
	errors?: ApiErrorOverrides;
};

export type UseApiQueryReturn<T> = {
	data: Ref<T | undefined>;
	error: Readonly<Ref<ApiQueryError | null>>;
	isPending: Readonly<Ref<boolean>>;
	refetch: () => Promise<void>;
};

type ParamsResult<P> = { ok: true; value: P } | { ok: false; error: unknown };

type JsonLike = Parameters<typeof deepEqual>[0];

function snapshotOf(params: unknown): JsonLike {
	return deepClone(params as Cloneable) as JsonLike;
}

function useQuery<P, T>(method: 'POST' | 'GET', endpoint: string, opts: UseApiQueryOptions<P, T>): UseApiQueryReturn<T> {
	const data = ref<T>() as Ref<T | undefined>;
	const error = ref<ApiQueryError | null>(null);
	const pending = ref(false);

	/** 最新の取得の世代。これと違う世代の取得の結果はすべて無視する */
	let generation = 0;
	let controller: AbortController | null = null;
	/** 進行中の取得を待っている `refetch()` を解決する */
	let settleInflight: (() => void) | null = null;
	/** 進行中の取得の params (複製)。進行中の取得がなければ null */
	let inflightParams: { value: JsonLike } | null = null;
	/** 表示中の data を取得した (または初期値として採用した) ときの params (複製)。data がなければ null */
	let dataParams: { value: JsonLike } | null = null;
	/** 最後に評価できた params (複製)。監視で変化を判定する。評価が throw したら null */
	let seenParams: { value: JsonLike } | null = null;
	let wasEnabled = false;
	let initialDataChecked = false;
	let disposed = false;

	function evaluateParams(): ParamsResult<P> {
		try {
			return { ok: true, value: (opts.params ? opts.params() : {}) as P };
		} catch (err) {
			return { ok: false, error: err };
		}
	}

	function toQueryError(failure: ApiFailure): ApiQueryError | null {
		const guidance = resolveApiGuidance(endpoint, failure, { overrides: opts.errors });
		return guidance == null ? null : { guidance, failure };
	}

	/** 世代を進めて進行中の取得を無効にしてから中断する。待っている `refetch()` は解決する */
	function abortInflight(): void {
		generation++;
		const c = controller;
		const settle = settleInflight;
		controller = null;
		settleInflight = null;
		inflightParams = null;
		c?.abort();
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

	/** params の評価が throw した: 新しい取得を始めたものとして扱い、data を消して「その他」の失敗にする */
	function failParams(err: unknown): void {
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
			// 送信時に書き込まれる認証情報が呼び元の値にも比較用の値にも入らないよう、送信には別の複製を渡す
			requestApi<T>(endpoint, snapshotOf(params) as Record<string, unknown>, { method, signal: ac.signal })
				// requestApi は reject しない約束だが、万一の reject も失敗として扱う
				.catch((err: unknown): ApiResult<never> => ({ ok: false, failure: { kind: 'other', raw: err } }))
				.then((result) => {
					// 置き換え・中断・破棄のときは、その時点で resolve 済み
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

	function onSourceChange(enabled: boolean, paramsResult: ParamsResult<P>): void {
		if (disposed) return;

		if (!enabled) {
			cancelInflight();
			clearData();
			error.value = null;
			wasEnabled = false;
			return;
		}

		const becameEnabled = !wasEnabled;
		wasEnabled = true;

		if (!paramsResult.ok) {
			failParams(paramsResult.error);
			return;
		}

		const snapshot = { value: snapshotOf(paramsResult.value) };
		const changed = seenParams == null || !deepEqual(seenParams.value, snapshot.value);
		seenParams = snapshot;

		if (becameEnabled && !initialDataChecked) {
			initialDataChecked = true;
			const initial = opts.initialData?.();
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

		// 手動: 取得はしないが、前の対象の data と、前の対象の進行中の取得は捨てる
		if (dataParams != null && !deepEqual(dataParams.value, snapshot.value)) clearData();
		if (inflightParams != null && !deepEqual(inflightParams.value, snapshot.value)) cancelInflight();
	}

	function refetch(): Promise<void> {
		if (disposed) return Promise.resolve();
		if (!(opts.enabled?.() ?? true)) return Promise.resolve();

		// 監視が条件の変化を拾う前に呼ばれた場合も、ここで真になったものとして扱う (二重の取得と初期値の採用を避ける)
		wasEnabled = true;
		initialDataChecked = true;

		const paramsResult = evaluateParams();
		if (!paramsResult.ok) {
			failParams(paramsResult.error);
			return Promise.resolve();
		}
		return startFetch(paramsResult.value);
	}

	if (getCurrentScope()) {
		onScopeDispose(() => {
			// 応答が届いていても状態を更新しないよう、世代を無効にしてから中断する
			disposed = true;
			abortInflight();
		}, true);
	}

	watch(
		() => [opts.enabled?.() ?? true, evaluateParams()] as const,
		([enabled, paramsResult]) => onSourceChange(enabled, paramsResult),
		{ deep: true, immediate: true },
	);

	return {
		data,
		error: computed(() => error.value),
		isPending: computed(() => pending.value),
		refetch,
	};
}

export function useApiQuery<E extends JsonEndpoint, P extends Misskey.Endpoints[E]['req']>(
	endpoint: E,
	opts: UseApiQueryOptions<P, ApiResponse<E, P>> = {},
): UseApiQueryReturn<ApiResponse<E, P>> {
	return useQuery('POST', endpoint, opts);
}

/** GET で取得する。ブラウザのキャッシュが効き、認証情報は送らない。それ以外は `useApiQuery` と同じ */
// TODO(api-error-types): GET 可能な24件に絞る
export function useApiGetQuery<E extends JsonEndpoint, P extends Misskey.Endpoints[E]['req']>(
	endpoint: E,
	opts: UseApiQueryOptions<P, ApiResponse<E, P>> = {},
): UseApiQueryReturn<ApiResponse<E, P>> {
	return useQuery('GET', endpoint, opts);
}
