/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiErrorBody, ApiFailure } from '@/utility/api/request.js';
import { i18n } from '@/i18n.js';

/** エラーの案内。`copyInfo` があれば「エラー情報をコピー」の操作に使う。 */
export type ApiGuidance = { title?: string; text: string; copyInfo?: string };

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
		case 'ACCESS_DENIED':
		case 'PERMISSION_DENIED':
			return { title: i18n.ts.permissionDeniedError, text: i18n.ts.permissionDeniedErrorDescription };
		case 'CREDENTIAL_REQUIRED':
			return { text: i18n.ts.signinRequired };
		case 'CONTENT_RESTRICTED_BY_USER':
			return { text: i18n.ts.thisContentsAreMarkedAsSigninRequiredByAuthor };
		case 'CONTENT_RESTRICTED_BY_SERVER':
			return { text: i18n.ts.signinOrContinueOnRemote };
		default:
			break;
	}

	// 対象が存在しない (削除済み・非公開を含む) ことを表す code は、エンドポイントごとに名前が違っても同じ扱いにする。
	if (error.code.startsWith('NO_SUCH_')) {
		return { title: i18n.ts.notFound, text: i18n.ts.notFoundResourceDescription };
	}

	return null;
}

/**
 * API 呼び出しの失敗から、表示に使う案内を同期的に組み立てる。
 * API エラーでは、固定の共通案内 (存在しない・権限がない・ログインが必要を含む)、`TOO_MANY` 系、汎用表示の順に探す。
 *
 * @returns 表示用の案内。中断は画面に出す必要がないため `null` を返す。
 * @throws `INTERNAL_ERROR` のコピー用情報を JSON に変換できない場合。
 */
export function resolveApiGuidance(endpoint: string, failure: ApiFailure): ApiGuidance | null {
	switch (failure.kind) {
		case 'aborted':
			return null;
		case 'network':
			return { title: i18n.ts.somethingHappened, text: i18n.ts.serverIsDead };
		case 'invalid-response':
			return { title: i18n.ts.gotInvalidResponseError, text: i18n.ts.gotInvalidResponseErrorDescription };
		case 'other':
			return { title: i18n.ts.somethingHappened, text: messageOf(failure.raw) };
		case 'api':
			break;
	}

	const error = failure.error;

	const fixed = resolveFixedApiErrorGuidance(endpoint, error);
	if (fixed != null) return fixed;

	if (error.code.startsWith('TOO_MANY')) {
		return { title: i18n.ts.youCannotCreateAnymore, text: `${i18n.ts.error}: ${error.id}` };
	}

	return { text: `${error.message}\n${error.id}` };
}
