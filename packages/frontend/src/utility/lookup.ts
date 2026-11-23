/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import type { Router } from '@/router.js';
import type { ApiFailure } from '@/utility/api/request.js';
import * as os from '@/os.js';
import { misskeyApiResult } from '@/utility/misskey-api.js';
import { resolveApiGuidance } from '@/utility/api/guidance.js';
import { showApiGuidanceDialog } from '@/utility/api/guidance-dialog.js';
import { reportApiCallbackError } from '@/utility/api/report-error.js';
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
	let failure: ApiFailure | null = null;
	const promise = misskeyApiResult('ap/show', { uri: query }).then(r => {
		if (r.ok) return r.data as Misskey.entities.ApShowResponse;
		failure = r.failure;
		throw r.failure.raw;
	});

	os.promiseDialog(promise, null, (err) => {
		// requestApi は reject しない約束だが、万一 reject しても案内が出るよう「その他」として扱う。
		try {
			const guidance = resolveApiGuidance('ap/show', failure ?? { kind: 'other', raw: err });
			if (guidance == null) return;
			showApiGuidanceDialog(guidance).catch(reportApiCallbackError);
		} catch (e) {
			reportApiCallbackError(e);
		}
	}, i18n.ts.fetchingAsApObject);

	return await promise;
}
