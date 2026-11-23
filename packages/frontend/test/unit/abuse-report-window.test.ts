/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import { i18n } from '@/i18n.js';
import MkAbuseReportWindow from '@/components/MkAbuseReportWindow.vue';

const requestApiMock = vi.hoisted(() => vi.fn());
vi.mock('@/utility/api/request.js', () => ({ requestApi: requestApiMock }));

const alertMock = vi.hoisted(() => vi.fn());
vi.mock('@/os.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/os.js')>();
	return { ...actual, alert: alertMock };
});

const user = { id: 'u1', username: 'alice', host: null, name: null } as unknown as Misskey.entities.UserLite;

function renderWindow() {
	// closed は MkWindow の Transition の afterLeave から届くので、Transition をスタブにしない。
	return render(MkAbuseReportWindow, {
		props: { user, initialComment: 'spam' },
		global: { components, directives, stubs: { transition: false } },
	});
}

beforeEach(() => {
	requestApiMock.mockReset();
	alertMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
});

describe('MkAbuseReportWindow', () => {
	test('送信が成功したら成功のアラートを出し、closed を通知する', async () => {
		requestApiMock.mockResolvedValue({ ok: true, data: null });
		const r = renderWindow();

		await fireEvent.click(r.getByText(i18n.ts.send));

		await waitFor(() => expect(r.emitted('closed')).toBeDefined());
		expect(requestApiMock).toHaveBeenCalledWith('users/report-abuse', { userId: 'u1', comment: 'spam' }, expect.objectContaining({ method: 'POST' }));
		expect(alertMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', text: i18n.ts.abuseReported }));
	});

	test('送信せずに閉じても closed を1回だけ通知する', async () => {
		const r = renderWindow();

		await fireEvent.keyDown(r.getByText(i18n.ts.send), { key: 'Escape', which: 27 });

		await waitFor(() => expect(r.emitted('closed')).toHaveLength(1));
		expect(requestApiMock).not.toHaveBeenCalled();
	});

	test('送信中にウィンドウを閉じても、成功したら成功のアラートを出す', async () => {
		let resolve!: (v: unknown) => void;
		requestApiMock.mockReturnValue(new Promise(r => { resolve = r; }));
		const r = renderWindow();

		await fireEvent.click(r.getByText(i18n.ts.send));
		await fireEvent.keyDown(r.getByText(i18n.ts.send), { key: 'Escape', which: 27 });
		await waitFor(() => expect(r.emitted('closed')).toHaveLength(1));
		r.unmount();

		resolve({ ok: true, data: null });
		await waitFor(() => expect(alertMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', text: i18n.ts.abuseReported })));
	});

	test('送信が失敗したら閉じない', async () => {
		requestApiMock.mockResolvedValue({ ok: false, failure: { kind: 'api', error: { code: 'X', id: 'x', message: 'm' }, raw: {} } });
		const r = renderWindow();

		await fireEvent.click(r.getByText(i18n.ts.send));
		await new Promise(resolve => setTimeout(resolve, 50));

		expect(alertMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
		expect(r.emitted('closed')).toBeUndefined();
	});
});
