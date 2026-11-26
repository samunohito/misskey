/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiFailure } from '@/utility/api/request.js';
import type { ResolveApiGuidanceOptions } from '@/utility/api/guidance.js';
import * as os from '@/os.js';
import { misskeyApiResult } from '@/utility/misskey-api.js';
import { resolveApiGuidance } from '@/utility/api/guidance.js';
import { showApiGuidanceDialog } from '@/utility/api/guidance-dialog.js';
import { reportApiCallbackError } from '@/utility/api/report-error.js';

/**
 * 失敗に対する案内を `resolveApiGuidance` で決めてダイアログで出す。案内が無い失敗では何もしない。
 * 定義表の読み込みを待つことがあるため、表示は非同期に始まる。案内の解決や表示の失敗は報告し、throw しない。
 * 案内の解決やダイアログが閉じるのは待たない。
 */
export function showApiFailureGuidance(endpoint: string, failure: ApiFailure, opts?: ResolveApiGuidanceOptions): void {
	resolveApiGuidance(endpoint, failure, opts)
		.then(guidance => {
			if (guidance == null) return;
			return showApiGuidanceDialog(guidance);
		})
		.catch(reportApiCallbackError);
}

/**
 * 待機ダイアログを出して JSON API に POST し、失敗したら案内を出す。
 *
 * @returns 成功時は応答で解決する。失敗時は `misskeyApi` と同じ元の値で reject する。ダイアログの終了は待たない。
 * @throws エンドポイント名に `://` が含まれる場合に同期的に throw する。
 */
export function requestWithGuidanceDialog(
	endpoint: string,
	data: object | undefined,
	opts: { token?: string | null; guidance?: ResolveApiGuidanceOptions; waitingText?: string } = {},
): Promise<unknown> {
	let failure: ApiFailure | null = null;
	const promise = misskeyApiResult(endpoint, data, opts.token).then(r => {
		if (r.ok) return r.data;
		failure = r.failure;
		throw r.failure.raw;
	});

	os.promiseDialog(promise, null, (err) => {
		// requestApi は reject しない約束だが、万一 reject しても案内が出るよう「その他」として扱う。
		showApiFailureGuidance(endpoint, failure ?? { kind: 'other', raw: err }, opts.guidance);
	}, opts.waitingText);

	return promise;
}
