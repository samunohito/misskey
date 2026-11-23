/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import type { ApiGuidance } from '@/utility/api/guidance.js';

/**
 * 案内をエラーのダイアログで出す。ダイアログが閉じられたら解決する。
 * `copyInfo` があれば「エラー情報をコピー」の操作を添え、選ばれたらクリップボードへ写す。
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
