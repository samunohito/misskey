/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * API のコールバックの例外や reject を同期的に報告する。
 * `app.config.errorHandler` が未設定のため、`console.error` に出す。報告に失敗しても throw しない。
 */
export function reportApiCallbackError(err: unknown): void {
	try {
		console.error(err);
	} catch {
		// 報告自体の失敗は握りつぶす (呼び元の処理を止めないため)
	}
}
