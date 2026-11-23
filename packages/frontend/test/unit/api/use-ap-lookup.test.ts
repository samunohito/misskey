/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { effectScope } from 'vue';
import { i18n } from '@/i18n.js';
import { useApLookup } from '@/composables/use-ap-lookup.js';
import type { ApiFailure, ApiResult } from '@/utility/api/request.js';

const requestApiMock = vi.hoisted(() => vi.fn());
vi.mock('@/utility/api/request.js', () => ({ requestApi: requestApiMock }));

const showApiGuidanceDialogMock = vi.hoisted(() => vi.fn());
vi.mock('@/utility/api/guidance-dialog.js', () => ({ showApiGuidanceDialog: showApiGuidanceDialogMock }));

const osMock = vi.hoisted(() => ({ promiseDialog: vi.fn() }));
vi.mock('@/os.js', () => osMock);

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/router.js', () => ({ useRouter: () => routerMock, mainRouter: routerMock }));

async function flush() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

const noteResponse = { type: 'Note', object: { id: 'n1' } };

beforeEach(() => {
	requestApiMock.mockReset();
	showApiGuidanceDialogMock.mockReset().mockResolvedValue(undefined);
	osMock.promiseDialog.mockReset().mockImplementation((p: Promise<unknown>) => p);
	routerMock.push.mockReset();
});

describe('useApLookup', () => {
	test('fetchingAsApObject の待機ダイアログを出して ap/show を呼び、結果のページへ遷移する', async () => {
		requestApiMock.mockResolvedValue({ ok: true, data: noteResponse } satisfies ApiResult<unknown>);
		const scope = effectScope();
		const { execute } = scope.run(() => useApLookup())!;

		const result = await execute('https://remote.example/notes/1');

		expect(result).toEqual({ status: 'success', data: noteResponse });
		expect(requestApiMock).toHaveBeenCalledWith('ap/show', { uri: 'https://remote.example/notes/1' }, expect.objectContaining({ method: 'POST' }));
		expect(osMock.promiseDialog).toHaveBeenCalledWith(expect.any(Promise), null, expect.any(Function), i18n.ts.fetchingAsApObject);
		expect(routerMock.push).toHaveBeenCalledWith('/notes/:noteId/:initialTab?', { params: { noteId: 'n1' } });
		expect(showApiGuidanceDialogMock).not.toHaveBeenCalled();
		scope.stop();
	});

	test('失敗したら定義表の案内を出し、遷移しない', async () => {
		const failure: ApiFailure = {
			kind: 'api',
			error: { code: 'NO_SUCH_OBJECT', id: 'dc94d745-1262-4e63-a17d-fecaa57efc82', message: 'm' },
			raw: {},
		};
		requestApiMock.mockResolvedValue({ ok: false, failure } satisfies ApiResult<unknown>);
		const scope = effectScope();
		const { execute } = scope.run(() => useApLookup())!;

		const result = await execute('https://remote.example/x');
		await flush();

		expect(result).toEqual({ status: 'failure', failure });
		expect(showApiGuidanceDialogMock).toHaveBeenCalledWith({
			title: i18n.ts._remoteLookupErrors._noSuchObject.title,
			text: i18n.ts._remoteLookupErrors._noSuchObject.description,
		});
		expect(routerMock.push).not.toHaveBeenCalled();
		scope.stop();
	});

	test('照会中に scope が破棄されたら、成功しても遷移しない', async () => {
		let resolve!: (r: ApiResult<unknown>) => void;
		requestApiMock.mockReturnValue(new Promise((r) => { resolve = r; }));
		const scope = effectScope();
		const { execute } = scope.run(() => useApLookup())!;

		const pending = execute('https://remote.example/notes/1');
		scope.stop();
		resolve({ ok: true, data: noteResponse });

		expect(await pending).toEqual({ status: 'success', data: noteResponse });
		expect(routerMock.push).not.toHaveBeenCalled();
	});

	test('照会中は isPending が true になり、重ねて呼ぶと busy で送らない', async () => {
		let resolve!: (r: ApiResult<unknown>) => void;
		requestApiMock.mockReturnValue(new Promise((r) => { resolve = r; }));
		const scope = effectScope();
		const { execute, isPending } = scope.run(() => useApLookup())!;

		const first = execute('https://remote.example/notes/1');
		expect(isPending.value).toBe(true);
		expect(await execute('https://remote.example/notes/1')).toEqual({ status: 'busy' });
		expect(requestApiMock).toHaveBeenCalledTimes(1);

		resolve({ ok: true, data: noteResponse });
		await first;
		expect(isPending.value).toBe(false);
		scope.stop();
	});
});
