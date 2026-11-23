/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiGuidance } from '@/utility/api/guidance.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';

/**
 * エラーの案内をダイアログで表示する。
 * `copyInfo` があればコピー操作を添え、選ばれたらクリップボードへの書き込みを開始する。
 *
 * @returns ダイアログでの操作が終わると解決する。クリップボードへの書き込み完了は待たない。
 * ダイアログを開けない場合やコピー処理が同期的に throw した場合は reject する。
 */
export async function showApiGuidanceDialog(guidance: ApiGuidance): Promise<void> {
	if (guidance.copyInfo == null) {
		await os.alert({
			type: 'error',
			title: guidance.title,
			text: guidance.text,
		});
		return;
	}

	const { result } = await os.actions({
		type: 'error',
		title: guidance.title,
		text: guidance.text,
		actions: [{
			value: 'ok',
			text: i18n.ts.gotIt,
			primary: true,
		}, {
			value: 'copy',
			text: i18n.ts.copyErrorInfo,
		}],
	});
	if (result === 'copy') {
		copyToClipboard(guidance.copyInfo);
	}
}
