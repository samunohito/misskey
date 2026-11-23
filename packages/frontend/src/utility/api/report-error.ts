/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 呼び元が渡したコールバック (`onSuccess` / `onError` など) が投げた例外を報告する。決して throw しない。
 * Misskey は `app.config.errorHandler` を設定していないため、報告先は `console.error` にする。
 */
export function reportApiCallbackError(err: unknown): void {
	try {
		console.error(err);
	} catch {
		// 報告自体の失敗は握りつぶす (呼び元の処理を止めないため)
	}
}
