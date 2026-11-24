/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { components } from '@/components/index.js';
import { i18n } from '@/i18n.js';
import MkError from '@/components/global/MkError.vue';

function renderError(props: { title?: string; text?: string } = {}) {
	return render(MkError, { props, global: { components } });
}

describe('MkError', () => {
	afterEach(() => {
		cleanup();
	});

	test('props がなければ既定の見出しだけを出す', () => {
		const r = renderError();
		expect(r.getByText(i18n.ts.somethingHappened)).toBeTruthy();
		expect(r.container.textContent?.trim()).toBe(`${i18n.ts.somethingHappened}${i18n.ts.retry}`);
	});

	test('title と text を出す', () => {
		const r = renderError({ title: 'T', text: 'line1\nline2' });
		expect(r.getByText('T')).toBeTruthy();
		expect(r.queryByText(i18n.ts.somethingHappened)).toBeNull();
		expect(r.getByText((_, el) => el?.textContent === 'line1\nline2')).toBeTruthy();
	});

	test('title がなければ既定の見出しと text を出す', () => {
		const r = renderError({ text: 'detail' });
		expect(r.getByText(i18n.ts.somethingHappened)).toBeTruthy();
		expect(r.getByText('detail')).toBeTruthy();
	});

	test('再試行ボタンで retry を出す', async () => {
		const r = renderError({ title: 'T' });
		await fireEvent.click(r.getByText(i18n.ts.retry));
		expect(r.emitted('retry')).toHaveLength(1);
	});
});
