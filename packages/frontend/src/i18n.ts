/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { markRaw, ref } from 'vue';
import type { Locale } from '../../../locales/index.js';
import { I18n } from '@/scripts/i18n.js';
import { miLocalStorage } from '@/local-storage.js';

const preParseLocale = miLocalStorage.getItem('locale');
export const lang = miLocalStorage.getItem('lang') ?? 'en-US';
export const locale = preParseLocale ? JSON.parse(preParseLocale) : {};
export const langs = _LANGS_;
// import ja from '../../../locales/ja-JP.yml';

/**
 * locale = 現在選択されている言語名
 * lang = 選択された言語のデータ
 * langs = Misskeyが選択できる言語名セット  (["ja-JS", "en-US", .... ]
 */
export const i18n = ref(new I18n<Locale>({}));

export async function getLocale() {
	const locale = (await import(`../../../locales/${lang}.yml`)).default;
	i18n.value = (new I18n(<Locale>(locale)));
	console.log(i18n);
}
/*
//  メモ：今のところ言語を切り替えるとフルリロードなので、localeは一回のランタイム上で一意である
export async function getLocale(locale : string) : Promise<typeof markRaw<I18n<Locale>>> {
	if (_DEV_) {
		const lang = (await import(`/../../assets/locales/${locale}.yml`)).default;
		miLocalStorage.setItem('lang', lang);
		 return markRaw(new I18n<Locale>(lang));
	} else {
		const preVersion = miLocalStorage.getItem('localeVersion');
		const preLocale = miLocalStorage.getItem('locale');
		// const localeOutdated = (version == null || localeVersion !== version || locale == null);

		// if (localeOutdated) {
		// const res = await window.fetch(`/assets/locales/${preLocale}.${preVersion}.json`);
		// if (res.status === 200) {
		// 	const newLocale = await res.text();
		// 	const parsedNewLocale = JSON.parse(newLocale);
		// 	miLocalStorage.setItem('locale', newLocale);
		// 	miLocalStorage.setItem('localeVersion', preVersion);
		// 	return markRaw(new I18n<Locale>(parsedNewLocale));
		// }
		// }
		return markRaw(new I18n<Locale>(JSON.parse(miLocalStorage.getItem('locale'))));
	}
}

export function updateLocale(newLocale): void {
	locale = newLocale;
}

export function updateI18n(newLocale) {
	i18n.ts = newLocale;
	const res = (await import(`../../../locales/${newLocale}.yml`)).default;

	if (_DEV_) {

	} else {

	}
}
*/
