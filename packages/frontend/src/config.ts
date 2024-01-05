/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { miLocalStorage } from '@/local-storage.js';
import { updateI18n } from '@/i18n.js';

const address = new URL(document.querySelector<HTMLMetaElement>('meta[property="instance_url"]')?.content || location.href);
const siteName = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content;

export const host = address.host;
export const hostname = address.hostname;
export const url = address.origin;
export const apiUrl = location.origin + '/api';
export const wsOrigin = location.origin;
export const lang = miLocalStorage.getItem('lang') ?? 'en-US';

if (_DEV_ ) {
	console.error('develop locale');
	const res = (await import(`../../../locales/${lang}.yml`)).default;
	console.log(res);
	const parsedNewLocale = res;
	miLocalStorage.setItem('locale', JSON.stringify(res));
	miLocalStorage.setItem('localeVersion', 'dev');
}

const preParseLocale = miLocalStorage.getItem('locale');
export let locale = preParseLocale ? JSON.parse(preParseLocale) : null;
export const version = _VERSION_;
export const instanceName = siteName === 'Misskey' ? host : siteName;
export const ui = miLocalStorage.getItem('ui');
export const debug = miLocalStorage.getItem('debug') === 'true';

export const langs = _LANGS_;

export function updateLocale(newLocale): void {
	locale = newLocale;
}
