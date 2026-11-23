/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { i18n } from '@/i18n.js';
import { apiWithDialog, popups } from '@/os.js';
import MkDialog from '@/components/MkDialog.vue';
import MkWaitingDialog from '@/components/MkWaitingDialog.vue';

// @/os.js を部分的に mock すると、os.ts と guidance-dialog.ts の循環 import で本物の os.alert が使われてしまう。
// そのため os.js は mock せず、popup に積まれたダイアログの props で表示内容を確かめる。

const copyToClipboardMock = vi.hoisted(() => vi.fn());
vi.mock('@/utility/copy-to-clipboard.js', () => ({ copyToClipboard: copyToClipboardMock }));

type DialogProps = {
	type?: string;
	title?: string;
	text?: string;
	actions?: { text: string; primary?: boolean; callback: () => void }[];
};

function respondApiError(code: string, id = 'error-id', extra: Record<string, unknown> = {}) {
	const error = { code, id, message: 'error message', kind: 'client', ...extra };
	fetchMock.mockResponseOnce(JSON.stringify({ error }), { status: 400 });
	return error;
}

async function flush() {
	// reject のあとに案内のダイアログが開くまで待つ。
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** 失敗させて、reject された値を返す。案内のダイアログが開くまで待つ。 */
async function callAndFail(...args: Parameters<typeof apiWithDialog>): Promise<unknown> {
	const reason = await apiWithDialog(...args).then(
		() => { throw new Error('should reject'); },
		(err: unknown) => err,
	);
	await flush();
	return reason;
}

function dialogs(): DialogProps[] {
	return popups.value.filter(p => p.component === MkDialog).map(p => p.props as DialogProps);
}

/** 開いた案内のダイアログのうち、表示内容 (type / title / text) だけを取り出す。 */
function shownGuidances() {
	return dialogs().map(({ type, title, text }) => ({ type, title, text }));
}

function lastWaitingDialog() {
	const p = popups.value.at(-1);
	if (p == null || p.component !== MkWaitingDialog) throw new Error('waiting dialog not opened');
	// popups は reactive なので、props の ref は読み出し時に値へ展開される。
	return p.props as { success: boolean; showing: boolean };
}

beforeEach(() => {
	fetchMock.resetMocks();
	// resetMocks() 後も setup.unit.ts の locale 用の絞り込みが残るため、API の fetch も差し替え対象にする。
	fetchMock.doMock();
	popups.value = [];
	copyToClipboardMock.mockReset();
	vi.useRealTimers();
});

describe('os.apiWithDialog (変えない)', () => {
	test('成功したら応答で解決し、待機ダイアログに成功を1秒表示してから閉じる', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		fetchMock.mockResponseOnce(JSON.stringify({ id: 'page-id' }), { status: 200 });

		const p = apiWithDialog('pages/show', { pageId: 'page-id' });
		const dialog = lastWaitingDialog();
		expect(dialog.showing).toBe(true);
		expect(dialog.success).toBe(false);

		await expect(p).resolves.toEqual({ id: 'page-id' });
		await flush();
		expect(dialog.success).toBe(true);
		expect(dialog.showing).toBe(true);

		vi.advanceTimersByTime(999);
		expect(dialog.showing).toBe(true);
		vi.advanceTimersByTime(1);
		expect(dialog.showing).toBe(false);
		expect(dialogs()).toEqual([]);
	});

	test('失敗したら待機ダイアログをすぐ閉じる', async () => {
		respondApiError('NO_SUCH_PAGE');
		const p = apiWithDialog('pages/show', { pageId: 'x' });
		const dialog = lastWaitingDialog();
		await p.catch(() => {});
		await flush();
		expect(dialog.showing).toBe(false);
		expect(dialog.success).toBe(false);
	});

	test('INTERNAL_ERROR はコピー操作つきの案内で、customErrors でも上書きされない', async () => {
		const info = { e: { message: 'boom' } };
		const error = respondApiError('INTERNAL_ERROR', 'internal-id', { info });

		const reason = await callAndFail('notes/create', { text: 'a' }, undefined, {
			'internal-id': { text: 'by id' },
			INTERNAL_ERROR: { text: 'by code' },
		});

		expect(reason).toEqual(error);
		expect(shownGuidances()).toEqual([{
			type: 'error',
			title: i18n.ts.internalServerError,
			text: i18n.ts.internalServerErrorDescription,
		}]);
		const actions = dialogs()[0].actions ?? [];
		expect(actions.map(({ text, primary }) => ({ text, primary }))).toEqual([
			{ text: i18n.ts.gotIt, primary: true },
			{ text: i18n.ts.copyErrorInfo, primary: undefined },
		]);

		actions[1].callback();
		await flush();
		expect(copyToClipboardMock).toHaveBeenCalledTimes(1);
		const copied = String(copyToClipboardMock.mock.calls[0][0]);
		expect(copied.startsWith(`Endpoint: notes/create\nInfo: ${JSON.stringify(info)}\nDate: `)).toBe(true);
	});

	test.each([
		['RATE_LIMIT_EXCEEDED', 'cannotPerformTemporary', 'cannotPerformTemporaryDescription'],
		['INVALID_PARAM', 'invalidParamError', 'invalidParamErrorDescription'],
		['ROLE_PERMISSION_DENIED', 'permissionDeniedError', 'permissionDeniedErrorDescription'],
	] as const)('%s は共通の案内で、customErrors でも上書きされず、元の値で reject', async (code, titleKey, textKey) => {
		const error = respondApiError(code, 'common-id');
		const reason = await callAndFail('notes/create', { text: 'a' }, undefined, { 'common-id': { text: 'by id' } });
		expect(reason).toEqual(error);
		expect(shownGuidances()).toEqual([{ type: 'error', title: i18n.ts[titleKey], text: i18n.ts[textKey] }]);
	});

	test('TOO_MANY で始まる code は、customErrors がなければ youCannotCreateAnymore と「error: id」', async () => {
		respondApiError('TOO_MANY_ANTENNAS', 'too-many-id');
		await callAndFail('antennas/create', {} as never);
		expect(shownGuidances()).toEqual([{
			type: 'error',
			title: i18n.ts.youCannotCreateAnymore,
			text: `${i18n.ts.error}: too-many-id`,
		}]);
	});

	test('customErrors の id のキーが当たれば、その title / text を出して元の値で reject', async () => {
		const error = respondApiError('NO_SUCH_PAGE', 'no-such-page-id');
		const reason = await callAndFail('pages/show', { pageId: 'x' }, undefined, {
			'no-such-page-id': { title: 'custom title', text: 'custom text' },
		});
		expect(reason).toEqual(error);
		expect(shownGuidances()).toEqual([{ type: 'error', title: 'custom title', text: 'custom text' }]);
	});

	test('未定義の API エラーは title なしで「message\\nid」を出して元の値で reject', async () => {
		const error = respondApiError('NO_SUCH_PAGE', 'no-such-page-id');
		const reason = await callAndFail('pages/show', { pageId: 'x' }, undefined, { 'other-id': { text: 'unused' } });
		expect(reason).toEqual(error);
		expect(shownGuidances()).toEqual([{ type: 'error', title: undefined, text: 'error message\nno-such-page-id' }]);
	});

	test('エンドポイント名に :// を含むと同期的に throw し、待機ダイアログを出さない', () => {
		expect(() => apiWithDialog('https://example.com' as never, {} as never)).toThrow('invalid endpoint');
		expect(popups.value).toEqual([]);
	});
});

describe('os.apiWithDialog (変える)', () => {
	test('通信失敗で serverIsDead の案内を出し、元の例外で reject', async () => {
		const err = new TypeError('Failed to fetch');
		fetchMock.mockRejectOnce(err);
		const reason = await callAndFail('pages/show', { pageId: 'x' });
		expect(reason).toBe(err);
		expect(shownGuidances()).toEqual([{ type: 'error', title: i18n.ts.somethingHappened, text: i18n.ts.serverIsDead }]);
	});

	test('不正な応答で gotInvalidResponseError の案内を出し、元の値で reject', async () => {
		fetchMock.mockResponseOnce('<html>', { status: 502 });
		const reason = await callAndFail('pages/show', { pageId: 'x' });
		expect(reason).toBeInstanceOf(SyntaxError);
		expect(shownGuidances()).toEqual([{
			type: 'error',
			title: i18n.ts.gotInvalidResponseError,
			text: i18n.ts.gotInvalidResponseErrorDescription,
		}]);
	});

	test('error が API エラーの構造を満たさない応答でも案内を出し、元の値で reject', async () => {
		fetchMock.mockResponseOnce('{"error":{}}', { status: 500 });
		const reason = await callAndFail('pages/show', { pageId: 'x' });
		expect(reason).toEqual({});
		expect(shownGuidances()).toEqual([{
			type: 'error',
			title: i18n.ts.gotInvalidResponseError,
			text: i18n.ts.gotInvalidResponseErrorDescription,
		}]);
	});

	// page-editor.vue が customErrors で渡していた UUID と案内。定義表に移したあとも同じ表示になることを確かめる。
	test.each([
		['pages/create', '4650348e-301c-499a-83c9-6aa988c66bc1'],
		['pages/update', '2298a392-d4a1-44c5-9ebb-ac1aeaa5a9ab'],
	] as const)('%s の NAME_ALREADY_EXISTS は、customErrors がなくても以前の customErrors と同じ案内を出す', async (endpoint, id) => {
		const legacyCustomErrors = {
			[id]: {
				title: i18n.ts.somethingHappened,
				text: i18n.ts._pages.nameAlreadyExists,
			},
		};

		respondApiError('NAME_ALREADY_EXISTS', id);
		await callAndFail(endpoint, {} as never, undefined, legacyCustomErrors);
		const error = respondApiError('NAME_ALREADY_EXISTS', id);
		const reason = await callAndFail(endpoint, {} as never);

		expect(reason).toEqual(error);
		const [withCustomErrors, withDefs] = shownGuidances();
		expect(withDefs).toEqual(withCustomErrors);
		expect(withDefs).toEqual({ type: 'error', ...legacyCustomErrors[id] });
	});

	test('customErrors の code のキーも上書きとして効く', async () => {
		respondApiError('NO_SUCH_PAGE');
		await callAndFail('pages/show', { pageId: 'x' }, undefined, { NO_SUCH_PAGE: { title: 't', text: 'by code' } });
		expect(shownGuidances()).toEqual([{ type: 'error', title: 't', text: 'by code' }]);
	});

	test('TOO_MANY で始まる code でも、customErrors があればそちらを出す', async () => {
		respondApiError('TOO_MANY_ANTENNAS', 'too-many-id');
		await callAndFail('antennas/create', {} as never, undefined, { 'too-many-id': { text: 'by id' } });
		expect(shownGuidances()).toEqual([{ type: 'error', title: undefined, text: 'by id' }]);
	});
});
