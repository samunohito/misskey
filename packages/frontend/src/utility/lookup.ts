/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import type { Router } from '@/router.js';
import * as os from '@/os.js';
import { requestWithGuidanceDialog } from '@/utility/api/failure-guidance.js';
import { i18n } from '@/i18n.js';
import { mainRouter } from '@/router.js';
import { acct } from '@@/js/user.js';

export async function lookup(router?: Router) {
	const _router = router ?? mainRouter;

	const { canceled, result: temp } = await os.inputText({
		title: i18n.ts.lookup,
	});
	const query = temp ? temp.trim() : '';
	if (canceled || query.length <= 1) return;

	if (query.startsWith('@') && !query.includes(' ')) {
		_router.pushByPath(`/${query}`);
		return;
	}

	if (query.startsWith('#')) {
		_router.push('/tags/:tag', {
			params: {
				tag: query.substring(1),
			}
		});
		return;
	}

	if (query.startsWith('https://')) {
		const res = await apLookup(query);
		openApLookupResult(_router, res);
		return;
	}
}

/** `ap/show` の結果の種類に応じて、ユーザーまたはノートのページへ遷移する。 */
export function openApLookupResult(router: Router, res: Misskey.entities.ApShowResponse): void {
	switch (res.type) {
		case 'User':
			router.push('/@:acct/:page?', {
				params: {
					acct: acct(res.object),
				},
			});
			break;
		case 'Note':
			router.push('/notes/:noteId/:initialTab?', {
				params: {
					noteId: res.object.id,
				},
			});
			break;
	}
}

/**
 * 待機ダイアログ (`fetchingAsApObject`) を出してリモートのオブジェクトを照会し、失敗したら案内を出す。
 * コンポーネントの外から呼ぶためにある。コンポーネントからは `useApLookup` を使う。
 *
 * @returns 成功時は `ap/show` の応答で解決する。失敗時は案内を出したうえで、`misskeyApi` と同じ元の値で reject する。
 */
export async function apLookup(query: string): Promise<Misskey.entities.ApShowResponse> {
	return await requestWithGuidanceDialog('ap/show', { uri: query }, {
		waitingText: i18n.ts.fetchingAsApObject,
	}) as Misskey.entities.ApShowResponse;
}
