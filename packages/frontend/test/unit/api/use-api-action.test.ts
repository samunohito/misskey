/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { effectScope } from 'vue';
import { useApiAction } from '@/composables/use-api-action.js';
import type { ApiFailure, ApiResult } from '@/utility/api/request.js';
import { loadApiErrorDefs } from '@/utility/api/guidance.js';

const requestApiMock = vi.hoisted(() => vi.fn());
vi.mock('@/utility/api/request.js', () => ({ requestApi: requestApiMock }));

const showApiGuidanceDialogMock = vi.hoisted(() => vi.fn());
vi.mock('@/utility/api/guidance-dialog.js', () => ({ showApiGuidanceDialog: showApiGuidanceDialogMock }));

const reportApiCallbackErrorMock = vi.hoisted(() => vi.fn());
vi.mock('@/utility/api/report-error.js', () => ({ reportApiCallbackError: reportApiCallbackErrorMock }));

const resolveApiGuidanceSpy = vi.hoisted(() => ({ fn: null as null | ReturnType<typeof vi.fn> }));
vi.mock('@/utility/api/guidance.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/utility/api/guidance.js')>();
	resolveApiGuidanceSpy.fn = vi.fn(actual.resolveApiGuidance);
	return { ...actual, resolveApiGuidance: resolveApiGuidanceSpy.fn };
});

const osMock = vi.hoisted(() => ({ promiseDialog: vi.fn() }));
vi.mock('@/os.js', () => osMock);

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };

function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => { resolve = r; });
	return { promise, resolve };
}

async function flush() {
	// execute() が待たないコールバックや案内の Promise に、後続の処理が走る時間を与える。
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

const apiFailure: ApiFailure = {
	kind: 'api',
	error: { code: 'NO_SUCH_USER', id: 'x', message: 'm' },
	raw: { code: 'NO_SUCH_USER', id: 'x', message: 'm' },
};

function ok<T>(data: T): ApiResult<T> {
	return { ok: true, data };
}

function ng(failure: ApiFailure = apiFailure): ApiResult<never> {
	return { ok: false, failure };
}

beforeAll(async () => {
	// 定義表は遅延読み込みなので、案内の表示が読み込みの完了待ちで遅れないよう先に読み込んでおく。
	await loadApiErrorDefs();
});

beforeEach(() => {
	requestApiMock.mockReset();
	showApiGuidanceDialogMock.mockReset().mockResolvedValue(undefined);
	reportApiCallbackErrorMock.mockReset();
	resolveApiGuidanceSpy.fn?.mockClear();
	// UI を開かず、実際の promiseDialog と同じように渡された Promise を返す。
	osMock.promiseDialog.mockReset().mockImplementation((p: Promise<unknown>) => p);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('useApiAction', () => {
	test('成功で onSuccess(data, params) を呼び、success を返す', async () => {
		requestApiMock.mockResolvedValue(ok({ id: 'u1' }));
		const onSuccess = vi.fn();
		const scope = effectScope();
		const { execute } = scope.run(() => useApiAction('users/show', { onSuccess }))!;
		const params = { userId: 'u1' };

		const result = await execute(params);

		expect(result).toEqual({ status: 'success', data: { id: 'u1' } });
		expect(onSuccess).toHaveBeenCalledExactlyOnceWith({ id: 'u1' }, params);
		expect(requestApiMock).toHaveBeenCalledExactlyOnceWith('users/show', params, { method: 'POST', token: undefined });
		expect(showApiGuidanceDialogMock).not.toHaveBeenCalled();
		scope.stop();
	});

	test('失敗で onError を呼んでから既定の案内を出し、failure を返す (reject しない)', async () => {
		requestApiMock.mockResolvedValue(ng());
		const order: string[] = [];
		const onError = vi.fn((_failure: ApiFailure) => { order.push('onError'); });
		showApiGuidanceDialogMock.mockImplementation(async () => { order.push('dialog'); });
		const scope = effectScope();
		const { execute } = scope.run(() => useApiAction('users/show', { onError }))!;

		const result = await execute({ userId: 'u1' });
		// 案内は定義表を引くことがあるため非同期に出る。
		await flush();

		expect(result).toEqual({ status: 'failure', failure: apiFailure });
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0][0]).toBe(apiFailure);
		expect(order).toEqual(['onError', 'dialog']);
		expect(showApiGuidanceDialogMock).toHaveBeenCalledExactlyOnceWith({ text: 'm\nx' });
		scope.stop();
	});

	test('onError が suppressDefault() を同期的に呼んだら既定の案内を出さない', async () => {
		requestApiMock.mockResolvedValue(ng());
		const scope = effectScope();
		const { execute } = scope.run(() => useApiAction('users/show', {
			onError: (_, ctx) => { ctx.suppressDefault(); },
		}))!;

		const result = await execute({ userId: 'u1' });

		expect(result.status).toBe('failure');
		expect(showApiGuidanceDialogMock).not.toHaveBeenCalled();
		scope.stop();
	});

	test('onError が非同期に suppressDefault() を呼んでも既定の案内は出る', async () => {
		requestApiMock.mockResolvedValue(ng());
		const { execute } = useApiAction('users/show', {
			onError: async (_, ctx) => {
				await Promise.resolve();
				ctx.suppressDefault();
			},
		});

		await execute({ userId: 'u1' });
		await flush();

		expect(showApiGuidanceDialogMock).toHaveBeenCalledOnce();
	});

	test('aborted は案内もコールバックも出さず failure を返す', async () => {
		const aborted: ApiFailure = { kind: 'aborted', raw: new DOMException('aborted', 'AbortError') };
		requestApiMock.mockResolvedValue(ng(aborted));
		const onSuccess = vi.fn();
		const onError = vi.fn();
		const { execute } = useApiAction('users/show', { onSuccess, onError });

		const result = await execute({ userId: 'u1' });

		expect(result).toEqual({ status: 'failure', failure: aborted });
		expect(onSuccess).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(showApiGuidanceDialogMock).not.toHaveBeenCalled();
	});

	test('実行中に再度呼ぶと送らずに busy を返し、実行中のリクエストの結果は返さない', async () => {
		const d = deferred<ApiResult<unknown>>();
		requestApiMock.mockReturnValueOnce(d.promise);
		const onSuccess = vi.fn();
		const { execute, isPending } = useApiAction('users/show', { onSuccess });

		const first = execute({ userId: 'u1' });
		expect(isPending.value).toBe(true);
		const second = await execute({ userId: 'u2' });

		expect(second).toEqual({ status: 'busy' });
		expect(requestApiMock).toHaveBeenCalledOnce();

		d.resolve(ok({ id: 'u1' }));
		expect(await first).toEqual({ status: 'success', data: { id: 'u1' } });
		expect(onSuccess).toHaveBeenCalledExactlyOnceWith({ id: 'u1' }, { userId: 'u1' });
		expect(isPending.value).toBe(false);

		requestApiMock.mockResolvedValueOnce(ok({ id: 'u3' }));
		expect(await execute({ userId: 'u3' })).toEqual({ status: 'success', data: { id: 'u3' } });
	});

	test('isPending は API の完了で偽になり、onSuccess が返す Promise を待たない', async () => {
		requestApiMock.mockResolvedValue(ok({ id: 'u1' }));
		const never = new Promise<void>(() => {});
		const { execute, isPending } = useApiAction('users/show', { onSuccess: () => never });

		expect(isPending.value).toBe(false);
		const result = await execute({ userId: 'u1' });

		expect(result.status).toBe('success');
		expect(isPending.value).toBe(false);
	});

	test('isPending は失敗の案内が閉じられるのを待たずに偽になる', async () => {
		requestApiMock.mockResolvedValue(ng());
		showApiGuidanceDialogMock.mockReturnValue(new Promise<void>(() => {}));
		const { execute, isPending } = useApiAction('users/show');

		const result = await execute({ userId: 'u1' });
		expect(isPending.value).toBe(false);
		await flush();

		expect(result.status).toBe('failure');
		expect(showApiGuidanceDialogMock).toHaveBeenCalledOnce();
		expect(isPending.value).toBe(false);
	});

	test('onSuccess が同期的に throw しても success を返し、reportApiCallbackError に渡す', async () => {
		requestApiMock.mockResolvedValue(ok({ id: 'u1' }));
		const err = new Error('boom');
		const { execute } = useApiAction('users/show', { onSuccess: () => { throw err; } });

		const result = await execute({ userId: 'u1' });

		expect(result).toEqual({ status: 'success', data: { id: 'u1' } });
		expect(reportApiCallbackErrorMock).toHaveBeenCalledExactlyOnceWith(err);
	});

	test('onError が返した Promise が reject しても failure を返し、報告する', async () => {
		requestApiMock.mockResolvedValue(ng());
		const err = new Error('async boom');
		const { execute } = useApiAction('users/show', { onError: () => Promise.reject(err) });

		const result = await execute({ userId: 'u1' });
		await flush();

		expect(result).toEqual({ status: 'failure', failure: apiFailure });
		expect(reportApiCallbackErrorMock).toHaveBeenCalledExactlyOnceWith(err);
		expect(showApiGuidanceDialogMock).toHaveBeenCalledOnce();
	});

	test('表示の失敗でも reject しない', async () => {
		requestApiMock.mockResolvedValue(ng());
		const err = new Error('dialog failed');
		showApiGuidanceDialogMock.mockRejectedValue(err);
		const { execute } = useApiAction('users/show');

		await expect(execute({ userId: 'u1' })).resolves.toEqual({ status: 'failure', failure: apiFailure });
		await flush();

		expect(reportApiCallbackErrorMock).toHaveBeenCalledExactlyOnceWith(err);
	});

	test('表示処理が同期的に throw しても reject しない', async () => {
		requestApiMock.mockResolvedValue(ng());
		const err = new Error('dialog threw');
		showApiGuidanceDialogMock.mockImplementation(() => { throw err; });
		const { execute } = useApiAction('users/show');

		await expect(execute({ userId: 'u1' })).resolves.toEqual({ status: 'failure', failure: apiFailure });
		expect(reportApiCallbackErrorMock).toHaveBeenCalledExactlyOnceWith(err);
	});

	test('scope の破棄後に完了したら onSuccess / onError を呼ばず、失敗なら既定の案内は出し、戻り値は実際の成否', async () => {
		const onSuccess = vi.fn();
		const onError = vi.fn();
		const scope = effectScope();
		const { execute, isPending } = scope.run(() => useApiAction('users/show', { onSuccess, onError }))!;

		const d1 = deferred<ApiResult<unknown>>();
		requestApiMock.mockReturnValueOnce(d1.promise);
		const p1 = execute({ userId: 'u1' });
		// 通信中に画面を離れた場合を再現するため、応答を返す前に scope を破棄する。
		scope.stop();
		d1.resolve(ok({ id: 'u1' }));
		expect(await p1).toEqual({ status: 'success', data: { id: 'u1' } });
		expect(isPending.value).toBe(false);

		const d2 = deferred<ApiResult<unknown>>();
		requestApiMock.mockReturnValueOnce(d2.promise);
		const p2 = execute({ userId: 'u2' });
		d2.resolve(ng());
		expect(await p2).toEqual({ status: 'failure', failure: apiFailure });
		await flush();

		expect(onSuccess).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(showApiGuidanceDialogMock).toHaveBeenCalledOnce();
	});

	test('scope の外で作っても動き、コールバックは常に呼ばれ、Vue の警告を出さない', async () => {
		const warn = vi.spyOn(console, 'warn');
		const onSuccess = vi.fn();
		const onError = vi.fn();
		const { execute, isPending } = useApiAction('users/show', { onSuccess, onError });

		requestApiMock.mockResolvedValueOnce(ok({ id: 'u1' }));
		await expect(execute({ userId: 'u1' })).resolves.toEqual({ status: 'success', data: { id: 'u1' } });
		requestApiMock.mockResolvedValueOnce(ng());
		await expect(execute({ userId: 'u2' })).resolves.toEqual({ status: 'failure', failure: apiFailure });

		expect(onSuccess).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledOnce();
		expect(showApiGuidanceDialogMock).toHaveBeenCalledOnce();
		expect(isPending.value).toBe(false);
		expect(warn).not.toHaveBeenCalled();
	});

	test('token を execute ごとに requestApi に渡す (null を含む)', async () => {
		requestApiMock.mockResolvedValue(ok(undefined));
		const { execute } = useApiAction('notes/create');

		await execute({ text: 'a' }, { token: 'TOKEN' });
		await execute({ text: 'b' }, { token: null });
		await execute({ text: 'c' });

		expect(requestApiMock.mock.calls.map((c) => c[2])).toEqual([
			{ method: 'POST', token: 'TOKEN' },
			{ method: 'POST', token: null },
			{ method: 'POST', token: undefined },
		]);
	});

	test('errors の上書きを resolveApiGuidance に渡す', async () => {
		requestApiMock.mockResolvedValue(ng());
		const errors = { NO_SUCH_USER: () => ({ title: 'T', text: 'overridden' }) };
		const { execute } = useApiAction('users/show', { errors });

		await execute({ userId: 'u1' });

		expect(resolveApiGuidanceSpy.fn).toHaveBeenCalledExactlyOnceWith('users/show', apiFailure, { overrides: errors });
		expect(showApiGuidanceDialogMock).toHaveBeenCalledExactlyOnceWith({ title: 'T', text: 'overridden' });
	});

	test('errors の上書きが throw しても reject せず報告し、次の優先順の案内を出す', async () => {
		requestApiMock.mockResolvedValue(ng());
		const err = new Error('override threw');
		const { execute } = useApiAction('users/show', { errors: { NO_SUCH_USER: () => { throw err; } } });

		await expect(execute({ userId: 'u1' })).resolves.toEqual({ status: 'failure', failure: apiFailure });
		expect(reportApiCallbackErrorMock).toHaveBeenCalledExactlyOnceWith(err);
		expect(showApiGuidanceDialogMock).toHaveBeenCalledExactlyOnceWith({ text: 'm\nx' });
	});

	test('waitingDialog を指定しなければ待機ダイアログを出さない', async () => {
		requestApiMock.mockResolvedValue(ok(undefined));
		const { execute } = useApiAction('users/show');

		await execute({ userId: 'u1' });

		expect(osMock.promiseDialog).not.toHaveBeenCalled();
	});

	test('waitingDialog を指定すると os.promiseDialog で待機を出し、失敗時にそのダイアログが別の案内を出さない', async () => {
		requestApiMock.mockResolvedValueOnce(ok({ id: 'u1' }));
		const { execute } = useApiAction('users/show', { waitingDialog: { text: 'waiting...' } });
		await execute({ userId: 'u1' });

		expect(osMock.promiseDialog).toHaveBeenCalledOnce();
		const [p1, onSuccess1, onFailure1, text1] = osMock.promiseDialog.mock.calls[0];
		// null は promiseDialog の既定のチェック表示を使う指定。
		expect(onSuccess1).toBeNull();
		expect(typeof onFailure1).toBe('function');
		expect(text1).toBe('waiting...');
		await expect(p1).resolves.toEqual({ id: 'u1' });

		requestApiMock.mockResolvedValueOnce(ng());
		const { execute: execute2 } = useApiAction('users/show', { waitingDialog: true });
		const result = await execute2({ userId: 'u2' });

		expect(result.status).toBe('failure');
		const [p2, onSuccess2, onFailure2, text2] = osMock.promiseDialog.mock.calls[1];
		expect(onSuccess2).toBeNull();
		expect(text2).toBeUndefined();
		await expect(p2).rejects.toBe(apiFailure);
		// モックは onFailure を呼ばないため、渡された関数を直接呼んで二重表示を検査する。
		expect(onFailure2(apiFailure)).toBeUndefined();
		expect(showApiGuidanceDialogMock).toHaveBeenCalledOnce();
	});

	test('待機ダイアログの表示が throw しても API は送り、reject しない', async () => {
		const err = new Error('popup failed');
		osMock.promiseDialog.mockImplementation(() => { throw err; });
		requestApiMock.mockResolvedValue(ok({ id: 'u1' }));
		const { execute } = useApiAction('users/show', { waitingDialog: true });

		await expect(execute({ userId: 'u1' })).resolves.toEqual({ status: 'success', data: { id: 'u1' } });
		expect(reportApiCallbackErrorMock).toHaveBeenCalledExactlyOnceWith(err);
	});
});
