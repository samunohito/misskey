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
 * コンポーネントの setup で作る。遷移には作成時の `useRouter()` を使う。
 * コンポーネントの外からは `apLookup` を使う。
 *
 * `ap/show` はリモートのユーザーやノートを作成しうるので、自動で取り直す `useApiQuery` にはしていない。
 * 照会は時間がかかり画面に実行中を示す場所もないことが多いため、`fetchingAsApObject` の待機ダイアログを出す。
 * 失敗の案内と `execute` の戻り値の意味は `useApiAction` と同じ。遷移は成功時のコールバックで行うため、
 * 照会中にコンポーネントが破棄されたら遷移しない。
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
