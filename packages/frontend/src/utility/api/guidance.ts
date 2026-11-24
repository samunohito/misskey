/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiErrorDefs } from '@/utility/api/error-defs.js';
import type { ApiErrorBody, ApiFailure } from '@/utility/api/request.js';
import { i18n } from '@/i18n.js';
import { reportApiCallbackError } from '@/utility/api/report-error.js';

export type ApiGuidanceText = { title?: string; text: string };

/** エラーの案内。`copyInfo` があれば「エラー情報をコピー」の操作に使う。 */
export type ApiGuidance = ApiGuidanceText & { copyInfo?: string };

/**
 * エラーの `code` をキーに、案内を組み立てる関数を定義する表。
 *
 * 型引数はエンドポイント名。エンドポイントにかかわらず任意の `code` を受け付ける。
 */
// TODO(api-error-types): misskey-js が生成するエラー型から、_E に存在する code だけを受け付ける型にする
export type ApiErrorOverrides<_E extends string = string> = Record<string, () => ApiGuidanceText>;

export type ResolveApiGuidanceOptions = {
	/** 固定の共通案内に該当しない API エラーで、エンドポイント別の定義より優先する。 */
	overrides?: ApiErrorOverrides;
	/** API エラーのエンドポイント別の定義。省略時は `resolveApiGuidance` が `apiErrorDefs` を読み込んで使う。 */
	defs?: ApiErrorDefs;
};

let defsLoading: Promise<ApiErrorDefs | null> | null = null;

/**
 * エンドポイント別の定義表を読み込む。読み込みは一度だけ行い、以後は同じ結果を返す。
 * 定義表の文言はビルド時に読み込む側の chunk へ埋め込まれるため、起動時の chunk に載せないよう動的 import にする。
 *
 * @returns 定義表。読み込みに失敗した場合は報告して `null` で解決し、次の呼び出しで読み込みをやり直す。reject しない。
 */
export function loadApiErrorDefs(): Promise<ApiErrorDefs | null> {
	defsLoading ??= import('@/utility/api/error-defs.js').then(m => m.apiErrorDefs, (err: unknown) => {
		reportApiCallbackError(err);
		defsLoading = null;
		return null;
	});
	return defsLoading;
}

function lookup(table: Record<string, () => ApiGuidanceText> | undefined, key: string): (() => ApiGuidanceText) | undefined {
	// key はサーバーから届くため、プロトタイプから継承した名前を案内として呼ばない。
	if (table == null || !Object.hasOwn(table, key)) return undefined;
	return table[key];
}

function invokeGuidance(fn: (() => ApiGuidanceText) | undefined): ApiGuidanceText | null {
	if (fn == null) return null;
	try {
		return fn();
	} catch (err) {
		reportApiCallbackError(err);
		return null;
	}
}

function messageOf(raw: unknown): string {
	if (typeof raw === 'object' && raw != null && 'message' in raw && typeof raw.message === 'string') {
		return raw.message;
	}
	return '';
}

function resolveFixedApiErrorGuidance(endpoint: string, error: ApiErrorBody): ApiGuidance | null {
	switch (error.code) {
		case 'INTERNAL_ERROR':
			return {
				title: i18n.ts.internalServerError,
				text: i18n.ts.internalServerErrorDescription,
				copyInfo: `Endpoint: ${endpoint}\nInfo: ${JSON.stringify(error.info)}\nDate: ${new Date().toISOString()}`,
			};
		case 'RATE_LIMIT_EXCEEDED':
			return { title: i18n.ts.cannotPerformTemporary, text: i18n.ts.cannotPerformTemporaryDescription };
		case 'INVALID_PARAM':
			return { title: i18n.ts.invalidParamError, text: i18n.ts.invalidParamErrorDescription };
		case 'ROLE_PERMISSION_DENIED':
			return { title: i18n.ts.permissionDeniedError, text: i18n.ts.permissionDeniedErrorDescription };
		default:
			return null;
	}
}

/** 定義表を引く前に決まった案内か、定義表で引く必要のある API エラー。 */
type EarlyResolution = { resolved: ApiGuidance | null } | { needsDefs: ApiErrorBody };

function resolveBeforeDefs(endpoint: string, failure: ApiFailure, overrides: ApiErrorOverrides | undefined): EarlyResolution {
	switch (failure.kind) {
		case 'aborted':
			return { resolved: null };
		case 'network':
			return { resolved: { title: i18n.ts.somethingHappened, text: i18n.ts.serverIsDead } };
		case 'invalid-response':
			return { resolved: { title: i18n.ts.gotInvalidResponseError, text: i18n.ts.gotInvalidResponseErrorDescription } };
		case 'other':
			return { resolved: { title: i18n.ts.somethingHappened, text: messageOf(failure.raw) } };
		case 'api':
			break;
	}

	// サーバー障害や権限不足などは、どの呼び出し元でも同じ案内を出すため先に解決する。
	const fixed = resolveFixedApiErrorGuidance(endpoint, failure.error);
	if (fixed != null) return { resolved: fixed };

	const overridden = invokeGuidance(lookup(overrides, failure.error.code));
	if (overridden != null) return { resolved: overridden };

	return { needsDefs: failure.error };
}

function resolveFromDefs(endpoint: string, error: ApiErrorBody, defs: ApiErrorDefs | null | undefined): ApiGuidance {
	const defined = defs == null ? null : invokeGuidance(lookup(Object.hasOwn(defs, endpoint) ? defs[endpoint] : undefined, error.code));
	if (defined != null) return defined;

	if (error.code.startsWith('TOO_MANY')) {
		return { title: i18n.ts.youCannotCreateAnymore, text: `${i18n.ts.error}: ${error.id}` };
	}

	return { text: `${error.message}\n${error.id}` };
}

/**
 * API 呼び出しの失敗から、表示に使う案内を組み立てる。
 * API エラーでは固定の共通案内、呼び元の上書き、エンドポイント別の定義、`TOO_MANY` 系、汎用表示の順に探す。
 * 上書きや定義の関数が throw したら報告し、案内が途切れないよう次の候補に進む。
 * 定義表が要るときだけ `loadApiErrorDefs` で読み込み、読み込めなければ定義表なしで続ける。
 *
 * @returns 表示用の案内。中断は画面に出す必要がないため `null` で解決する。
 * `INTERNAL_ERROR` のコピー用情報を JSON に変換できない場合は reject する。
 */
export async function resolveApiGuidance(endpoint: string, failure: ApiFailure, opts?: ResolveApiGuidanceOptions): Promise<ApiGuidance | null> {
	const early = resolveBeforeDefs(endpoint, failure, opts?.overrides);
	if ('resolved' in early) return early.resolved;
	const defs = opts?.defs ?? await loadApiErrorDefs();
	return resolveFromDefs(endpoint, early.needsDefs, defs);
}

/**
 * `resolveApiGuidance` と同じ順で案内を同期的に組み立てる。定義表は `opts.defs` に渡したものだけを使い、読み込まない。
 *
 * @returns 表示用の案内。中断は `null`。
 * @throws `INTERNAL_ERROR` のコピー用情報を JSON に変換できない場合。
 */
export function resolveApiGuidanceSync(endpoint: string, failure: ApiFailure, opts?: ResolveApiGuidanceOptions): ApiGuidance | null {
	const early = resolveBeforeDefs(endpoint, failure, opts?.overrides);
	if ('resolved' in early) return early.resolved;
	return resolveFromDefs(endpoint, early.needsDefs, opts?.defs);
}
