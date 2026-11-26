/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import type { Ref } from 'vue';
import type { ApiActionResult } from '@/composables/use-api-action.js';
import { useApiAction } from '@/composables/use-api-action.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { openApLookupResult } from '@/utility/lookup.js';

/**
 * リモートのオブジェクトを `ap/show` で照会し、結果の種類 (User / Note) に応じたページへ遷移する。
 * 遷移には作成時に `useRouter()` で取得したルーターを使う。照会中にスコープが破棄されたら遷移しない。
 *
 * `ap/show` はリモートのユーザーやノートを作成しうるため、`execute` を呼んだときだけ照会する。
 * 照会中は待機ダイアログ (`fetchingAsApObject`) を出し、中断以外の失敗では案内を出す。
 *
 * @returns 照会結果を値で返す `execute` と実行状態 `isPending`。照会中に再度 `execute` を呼ぶと `busy` で解決する。
 */
export function useApLookup(): {
	execute: (uri: string) => Promise<ApiActionResult<Misskey.entities.ApShowResponse>>;
	isPending: Readonly<Ref<boolean>>;
} {
	const router = useRouter();
	const { execute, isPending } = useApiAction('ap/show', {
		waitingDialog: { text: i18n.ts.fetchingAsApObject },
		onSuccess: (res) => openApLookupResult(router, res),
	});

	return {
		execute: (uri) => execute({ uri }),
		isPending,
	};
}
