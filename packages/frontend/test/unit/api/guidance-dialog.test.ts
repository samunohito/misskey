/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { i18n } from '@/i18n.js';
import { showApiGuidanceDialog } from '@/utility/api/guidance-dialog.js';
import { reportApiCallbackError } from '@/utility/api/report-error.js';

const osMock = vi.hoisted(() => {
	return {
		alert: vi.fn(),
		actions: vi.fn(),
	};
});

vi.mock('@/os.js', () => {
	return osMock;
});

const copyToClipboardMock = vi.hoisted(() => vi.fn());

vi.mock('@/utility/copy-to-clipboard.js', () => {
	return { copyToClipboard: copyToClipboardMock };
});

beforeEach(() => {
	osMock.alert.mockReset().mockResolvedValue(undefined);
	osMock.actions.mockReset();
	copyToClipboardMock.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('showApiGuidanceDialog', () => {
	test('copyInfo がなければ os.alert({ type: "error", title, text })', async () => {
		await expect(showApiGuidanceDialog({ title: 't', text: 'x' })).resolves.toBeUndefined();
		expect(osMock.alert).toHaveBeenCalledExactlyOnceWith({ type: 'error', title: 't', text: 'x' });
		expect(osMock.actions).not.toHaveBeenCalled();
	});

	test('title がなければ title なしで出す', async () => {
		await showApiGuidanceDialog({ text: 'x' });
		expect(osMock.alert).toHaveBeenCalledExactlyOnceWith({ type: 'error', title: undefined, text: 'x' });
	});

	test('os.alert が閉じられるまで解決しない', async () => {
		let close!: () => void;
		osMock.alert.mockReturnValue(new Promise<void>((resolve) => { close = resolve; }));
		let settled = false;
		const p = showApiGuidanceDialog({ text: 'x' }).then(() => { settled = true; });
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).toBe(false);
		close();
		await p;
		expect(settled).toBe(true);
	});

	test('copyInfo があれば os.actions で gotIt と copyErrorInfo を出し、copy を選ぶとクリップボードへ', async () => {
		osMock.actions.mockResolvedValue({ canceled: false, result: 'copy' });
		await showApiGuidanceDialog({ title: 't', text: 'x', copyInfo: 'Endpoint: a\nInfo: {}\nDate: d' });
		expect(osMock.alert).not.toHaveBeenCalled();
		expect(osMock.actions).toHaveBeenCalledExactlyOnceWith({
			type: 'error',
			title: 't',
			text: 'x',
			actions: [
				{ value: 'ok', text: i18n.ts.gotIt, primary: true },
				{ value: 'copy', text: i18n.ts.copyErrorInfo },
			],
		});
		expect(copyToClipboardMock).toHaveBeenCalledExactlyOnceWith('Endpoint: a\nInfo: {}\nDate: d');
	});

	test.each([
		['ok を選ぶ', { canceled: false, result: 'ok' }],
		['閉じる', { canceled: true }],
	])('copyInfo があっても %s とコピーしない', async (_, ret) => {
		osMock.actions.mockResolvedValue(ret);
		await showApiGuidanceDialog({ title: 't', text: 'x', copyInfo: 'info' });
		expect(copyToClipboardMock).not.toHaveBeenCalled();
	});
});

describe('reportApiCallbackError', () => {
	test('reportApiCallbackError は console.error に渡し、console.error が throw しても throw しない', () => {
		const err = new Error('boom');
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		reportApiCallbackError(err);
		expect(spy).toHaveBeenCalledOnce();
		expect(spy.mock.calls[0]).toContain(err);

		spy.mockImplementation(() => {
			throw new Error('console is broken');
		});
		expect(() => reportApiCallbackError(err)).not.toThrow();
	});
});
