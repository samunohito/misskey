/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { effectScope, reactive, ref } from 'vue';
import { useApiGetQuery, useApiQuery } from '@/composables/use-api-query.js';
import type * as Misskey from 'misskey-js';
import type { EffectScope } from 'vue';
import type { ApiFailure, ApiResult, RequestApiOptions } from '@/utility/api/request.js';

const requestApiMock = vi.hoisted(() => vi.fn());
vi.mock('@/utility/api/request.js', () => ({ requestApi: requestApiMock }));

const resolveApiGuidanceSpy = vi.hoisted(() => ({ fn: null as null | ReturnType<typeof vi.fn> }));
vi.mock('@/utility/api/guidance.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/utility/api/guidance.js')>();
	resolveApiGuidanceSpy.fn = vi.fn(actual.resolveApiGuidance);
	return { ...actual, resolveApiGuidance: resolveApiGuidanceSpy.fn };
});

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };

function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => { resolve = r; });
	return { promise, resolve };
}

type Call = {
	endpoint: string;
	params: Record<string, unknown>;
	opts: RequestApiOptions;
	respond: (result: ApiResult<unknown>) => void;
};

let calls: Call[] = [];
let scopes: EffectScope[] = [];

/** マイクロタスクを流しきる (watch の pre flush もここで走る) */
async function flush() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

const apiFailure: ApiFailure = {
	kind: 'api',
	error: { code: 'NO_SUCH_NOTE', id: 'x', message: 'm' },
	raw: { code: 'NO_SUCH_NOTE', id: 'x', message: 'm' },
};

function ok<T>(data: T): ApiResult<T> {
	return { ok: true, data };
}

/** 応答の型に合わせるための、中身を省いたノート */
function fakeNote(v: Record<string, unknown>): Misskey.entities.Note {
	return v as unknown as Misskey.entities.Note;
}

function ng(failure: ApiFailure = apiFailure): ApiResult<never> {
	return { ok: false, failure };
}

function inScope<T>(fn: () => T): T & { scope: EffectScope } {
	const scope = effectScope();
	scopes.push(scope);
	const r = scope.run(fn)!;
	return { ...r, scope };
}

beforeEach(() => {
	calls = [];
	scopes = [];
	requestApiMock.mockReset().mockImplementation((endpoint: string, params: Record<string, unknown>, opts: RequestApiOptions) => {
		const d = deferred<ApiResult<unknown>>();
		calls.push({ endpoint, params, opts, respond: d.resolve });
		return d.promise;
	});
	resolveApiGuidanceSpy.fn?.mockClear();
});

afterEach(() => {
	for (const s of scopes) s.stop();
	vi.restoreAllMocks();
});

describe('useApiQuery', () => {
	test('自動: 作成時に1回取得し、data に入れる', async () => {
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }) }));

		expect(calls).toHaveLength(1);
		expect(calls[0].endpoint).toBe('notes/show');
		expect(calls[0].params).toEqual({ noteId: 'a' });
		expect(calls[0].opts.method).toBe('POST');
		expect(calls[0].opts.signal).toBeInstanceOf(AbortSignal);
		expect(q.isPending.value).toBe(true);
		expect(q.data.value).toBeUndefined();

		calls[0].respond(ok({ id: 'a' }));
		await flush();

		expect(q.data.value).toEqual({ id: 'a' });
		expect(q.error.value).toBeNull();
		expect(q.isPending.value).toBe(false);
		expect(calls).toHaveLength(1);
	});

	test('手動: 作成時も params の変化でも取得せず、refetch() でだけ取得する', async () => {
		const id = ref('a');
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: id.value }), manual: true }));
		await flush();
		expect(calls).toHaveLength(0);
		expect(q.isPending.value).toBe(false);

		id.value = 'b';
		await flush();
		expect(calls).toHaveLength(0);

		const p = q.refetch();
		expect(calls).toHaveLength(1);
		expect(calls[0].params).toEqual({ noteId: 'b' });
		calls[0].respond(ok({ id: 'b' }));
		await p;
		expect(q.data.value).toEqual({ id: 'b' });
	});

	test('params が変わると取り直し、取得開始時に前の data を消す', async () => {
		const id = ref('a');
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: id.value }) }));
		calls[0].respond(ok({ id: 'a' }));
		await flush();
		expect(q.data.value).toEqual({ id: 'a' });

		id.value = 'b';
		await flush();
		expect(calls).toHaveLength(2);
		expect(calls[1].params).toEqual({ noteId: 'b' });
		expect(q.data.value).toBeUndefined();
		expect(q.isPending.value).toBe(true);

		calls[1].respond(ok({ id: 'b' }));
		await flush();
		expect(q.data.value).toEqual({ id: 'b' });
	});

	test('params の値が同じなら監視が反応しても取り直さない', async () => {
		const state = reactive({ id: 'a', unrelated: 0 });
		inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: state.id, _: state.unrelated > 100 ? 1 : 0 }) }));
		calls[0].respond(ok({ id: 'a' }));
		await flush();

		state.unrelated = 1;
		await flush();
		expect(calls).toHaveLength(1);
	});

	test('手動でも params が変わった時点で前の data を消す (refetch を待たない)', async () => {
		const id = ref('a');
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: id.value }), manual: true }));
		const p = q.refetch();
		calls[0].respond(ok({ id: 'a' }));
		await p;
		expect(q.data.value).toEqual({ id: 'a' });

		id.value = 'b';
		await flush();
		expect(q.data.value).toBeUndefined();
		expect(calls).toHaveLength(1);
	});

	test('手動で params が変わると、前の params の進行中の取得を中断する', async () => {
		const id = ref('a');
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: id.value }), manual: true }));
		const p = q.refetch();
		id.value = 'b';
		await flush();
		expect(calls[0].opts.signal?.aborted).toBe(true);
		expect(q.isPending.value).toBe(false);
		await p;

		calls[0].respond(ok({ id: 'a' }));
		await flush();
		expect(q.data.value).toBeUndefined();
	});

	test('同じ params の refetch では data を残し、失敗したら data を残して error を立てる', async () => {
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }) }));
		calls[0].respond(ok({ id: 'a', v: 1 }));
		await flush();

		const p1 = q.refetch();
		expect(q.data.value).toEqual({ id: 'a', v: 1 });
		expect(q.isPending.value).toBe(true);
		calls[1].respond(ok({ id: 'a', v: 2 }));
		await p1;
		expect(q.data.value).toEqual({ id: 'a', v: 2 });

		const p2 = q.refetch();
		calls[2].respond(ng());
		await p2;
		expect(q.data.value).toEqual({ id: 'a', v: 2 });
		expect(q.error.value?.failure).toEqual(apiFailure);
	});

	test('error は取得開始時に消え、guidance と failure を持つ', async () => {
		const errors = { NO_SUCH_NOTE: () => ({ title: 't', text: 'no such note' }) };
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }), errors }));
		calls[0].respond(ng());
		await flush();

		expect(q.error.value).toEqual({ guidance: { title: 't', text: 'no such note' }, failure: apiFailure });
		expect(resolveApiGuidanceSpy.fn).toHaveBeenCalledWith('notes/show', apiFailure, { overrides: errors });
		expect(q.isPending.value).toBe(false);

		void q.refetch();
		expect(q.error.value).toBeNull();
		expect(q.isPending.value).toBe(true);
	});

	test('新しい取得を始めると前のリクエストを中断し、古い応答の成功・失敗は状態を書き換えない', async () => {
		const id = ref('a');
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: id.value }) }));

		id.value = 'b';
		await flush();
		expect(calls).toHaveLength(2);
		expect(calls[0].opts.signal?.aborted).toBe(true);

		// 古い応答の成功
		calls[0].respond(ok({ id: 'a' }));
		await flush();
		expect(q.data.value).toBeUndefined();
		expect(q.isPending.value).toBe(true);

		id.value = 'c';
		await flush();
		expect(calls[1].opts.signal?.aborted).toBe(true);

		// 古い応答の失敗
		calls[1].respond(ng());
		await flush();
		expect(q.error.value).toBeNull();
		expect(q.isPending.value).toBe(true);

		calls[2].respond(ok({ id: 'c' }));
		await flush();
		expect(q.data.value).toEqual({ id: 'c' });
		expect(q.isPending.value).toBe(false);
	});

	test('enabled が偽の間は自動でも refetch でも送らず、data / error を消し、isPending は偽', async () => {
		const enabled = ref(false);
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }), enabled: () => enabled.value }));
		await flush();
		expect(calls).toHaveLength(0);

		await q.refetch();
		expect(calls).toHaveLength(0);
		expect(q.data.value).toBeUndefined();
		expect(q.error.value).toBeNull();
		expect(q.isPending.value).toBe(false);

		// 一度取得して data と error を持たせてから偽にする
		enabled.value = true;
		await flush();
		calls[0].respond(ok({ id: 'a' }));
		await flush();
		const p = q.refetch();
		calls[1].respond(ng());
		await p;
		expect(q.data.value).toEqual({ id: 'a' });
		expect(q.error.value).not.toBeNull();

		enabled.value = false;
		await flush();
		expect(q.data.value).toBeUndefined();
		expect(q.error.value).toBeNull();
		expect(q.isPending.value).toBe(false);
	});

	test('enabled が真から偽になると進行中の取得を中断する', async () => {
		const enabled = ref(true);
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }), enabled: () => enabled.value }));
		const p = q.refetch();
		expect(calls).toHaveLength(2);

		enabled.value = false;
		await flush();
		expect(calls[1].opts.signal?.aborted).toBe(true);
		expect(q.isPending.value).toBe(false);
		await p;

		calls[1].respond(ok({ id: 'a' }));
		await flush();
		expect(q.data.value).toBeUndefined();
		expect(q.isPending.value).toBe(false);
	});

	test('enabled が偽から真になると、自動なら取得する', async () => {
		const enabled = ref(false);
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }), enabled: () => enabled.value }));
		await flush();
		expect(calls).toHaveLength(0);

		enabled.value = true;
		await flush();
		expect(calls).toHaveLength(1);
		calls[0].respond(ok({ id: 'a' }));
		await flush();
		expect(q.data.value).toEqual({ id: 'a' });

		// 偽→真の往復では同じ params でも取り直す
		enabled.value = false;
		await flush();
		enabled.value = true;
		await flush();
		expect(calls).toHaveLength(2);
	});

	test('enabled が偽から真になっても、手動なら refetch を待つ', async () => {
		const enabled = ref(false);
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }), enabled: () => enabled.value, manual: true }));
		enabled.value = true;
		await flush();
		expect(calls).toHaveLength(0);

		void q.refetch();
		expect(calls).toHaveLength(1);
	});

	test('initialData は enabled が初めて真になった時点で1回だけ採用し、その時点の取得を省く', async () => {
		const enabled = ref(false);
		const initialData = vi.fn(() => fakeNote({ id: 'init' }));
		const q = inScope(() => useApiQuery('notes/show', {
			params: () => ({ noteId: 'a' }),
			enabled: () => enabled.value,
			initialData,
		}));
		await flush();
		expect(initialData).not.toHaveBeenCalled();
		expect(q.data.value).toBeUndefined();

		enabled.value = true;
		await flush();
		expect(initialData).toHaveBeenCalledTimes(1);
		expect(q.data.value).toEqual({ id: 'init' });
		expect(calls).toHaveLength(0);
		expect(q.isPending.value).toBe(false);

		// 同じ params の refetch は初期値を残したまま取り直す
		const p = q.refetch();
		expect(q.data.value).toEqual({ id: 'init' });
		calls[0].respond(ok({ id: 'a' }));
		await p;
		expect(q.data.value).toEqual({ id: 'a' });

		// 2回目に真になったときは採用しない
		enabled.value = false;
		await flush();
		enabled.value = true;
		await flush();
		expect(initialData).toHaveBeenCalledTimes(1);
		expect(calls).toHaveLength(2);
	});

	test('initialData が undefined を返したら採用せず、通常どおり取得する', async () => {
		inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }), initialData: () => undefined }));
		expect(calls).toHaveLength(1);
	});

	test('initialData を採用したあと params が変わったら消して取得する', async () => {
		const id = ref('a');
		const q = inScope(() => useApiQuery('notes/show', {
			params: () => ({ noteId: id.value }),
			initialData: () => fakeNote({ id: 'init' }),
		}));
		expect(calls).toHaveLength(0);
		expect(q.data.value).toEqual({ id: 'init' });

		id.value = 'b';
		await flush();
		expect(q.data.value).toBeUndefined();
		expect(calls).toHaveLength(1);
		expect(calls[0].params).toEqual({ noteId: 'b' });
	});

	test('data は書き換えられ、次の取得の成功で上書きされる', async () => {
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }) }));
		calls[0].respond(ok({ id: 'a', likes: 1 }));
		await flush();

		(q.data.value as unknown as { likes: number }).likes = 2;
		expect(q.data.value).toEqual({ id: 'a', likes: 2 });
		q.data.value = fakeNote({ id: 'a', likes: 3 });
		expect(q.data.value).toEqual({ id: 'a', likes: 3 });

		// 書き換えは表示中の対象への更新なので、同じ params の取り直しでは消えない
		const p = q.refetch();
		expect(q.data.value).toEqual({ id: 'a', likes: 3 });
		calls[1].respond(ok({ id: 'a', likes: 10 }));
		await p;
		expect(q.data.value).toEqual({ id: 'a', likes: 10 });
	});

	test('画面の非同期処理は、開始時と完了時の data の同一性で対象の切り替えを判定できる', async () => {
		const id = ref('a');
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: id.value }) }));
		calls[0].respond(ok({ id: 'a' }));
		await flush();
		const target = q.data.value;

		// 同じ params の取り直し中は同じ対象のまま
		void q.refetch();
		expect(q.data.value).toBe(target);

		id.value = 'b';
		await flush();
		calls[2].respond(ok({ id: 'b' }));
		await flush();
		expect(q.data.value).not.toBe(target);
	});

	test('入れ子の書き換えを拾う (params が返す配列をその場で書き換え)', async () => {
		const ids = reactive(['a']);
		const q = inScope(() => useApiQuery('users/show', { params: () => ({ userIds: ids }) }));
		expect(calls[0].params).toEqual({ userIds: ['a'] });
		calls[0].respond(ok([{ id: 'a' }]));
		await flush();
		expect(q.data.value).toEqual([{ id: 'a' }]);

		ids.push('b');
		await flush();
		// 比較用の値は前の値 (['a']) のまま残っているので、変化として扱い data を消して取り直す
		expect(calls).toHaveLength(2);
		expect(calls[1].params).toEqual({ userIds: ['a', 'b'] });
		expect(q.data.value).toBeUndefined();

		calls[1].respond(ok([{ id: 'a' }, { id: 'b' }]));
		await flush();

		// その場で書き換えても同じ値に戻したなら、比較用の値と同じなので data を残す
		const p = q.refetch();
		expect(q.data.value).toEqual([{ id: 'a' }, { id: 'b' }]);
		calls[2].respond(ok([{ id: 'a' }, { id: 'b' }]));
		await p;
	});

	test('params の評価が throw したら、前の取得を無効にして data を消し、kind: other の error を立てる', async () => {
		const fail = ref(false);
		const boom = new Error('boom');
		const q = inScope(() => useApiQuery('notes/show', {
			params: () => {
				if (fail.value) throw boom;
				return { noteId: 'a' };
			},
		}));
		calls[0].respond(ok({ id: 'a' }));
		await flush();

		void q.refetch();
		expect(calls).toHaveLength(2);

		fail.value = true;
		await flush();
		expect(calls).toHaveLength(2);
		expect(calls[1].opts.signal?.aborted).toBe(true);
		expect(q.data.value).toBeUndefined();
		expect(q.isPending.value).toBe(false);
		expect(q.error.value?.failure).toEqual({ kind: 'other', raw: boom });
		expect(q.error.value?.guidance.text).toBe('boom');

		// 古い応答は無視する
		calls[1].respond(ok({ id: 'a' }));
		await flush();
		expect(q.data.value).toBeUndefined();

		// refetch でも同じく扱い、reject しない
		await expect(q.refetch()).resolves.toBeUndefined();
		expect(q.error.value?.failure).toEqual({ kind: 'other', raw: boom });

		// 直れば取り直す
		fail.value = false;
		await flush();
		expect(calls).toHaveLength(3);
		expect(q.error.value).toBeNull();
	});

	test('enabled の評価が throw したら、前の取得を無効にして data を消し、kind: other の error を立てる', async () => {
		const fail = ref(false);
		const boom = new Error('enabled threw');
		const q = inScope(() => useApiQuery('notes/show', {
			params: () => ({ noteId: 'a' }),
			enabled: () => {
				if (fail.value) throw boom;
				return true;
			},
		}));
		calls[0].respond(ok({ id: 'a' }));
		await flush();
		expect(q.data.value).toEqual({ id: 'a' });

		void q.refetch();
		expect(calls).toHaveLength(2);

		fail.value = true;
		await flush();
		expect(calls).toHaveLength(2);
		expect(calls[1].opts.signal?.aborted).toBe(true);
		expect(q.data.value).toBeUndefined();
		expect(q.isPending.value).toBe(false);
		expect(q.error.value?.failure).toEqual({ kind: 'other', raw: boom });

		// refetch でも同じく扱い、同期的に throw も reject もしない
		let p: Promise<void> | undefined;
		expect(() => { p = q.refetch(); }).not.toThrow();
		await expect(p).resolves.toBeUndefined();
		expect(calls).toHaveLength(2);
		expect(q.error.value?.failure).toEqual({ kind: 'other', raw: boom });

		// 直れば取り直す
		fail.value = false;
		await flush();
		expect(calls).toHaveLength(3);
		expect(q.error.value).toBeNull();
	});

	test('initialData が throw したら報告し、値がなかったものとして取得する', async () => {
		const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
		const boom = new Error('initialData threw');
		const q = inScope(() => useApiQuery('notes/show', {
			params: () => ({ noteId: 'a' }),
			initialData: () => { throw boom; },
		}));
		expect(reported).toHaveBeenCalledExactlyOnceWith(boom);
		expect(calls).toHaveLength(1);
		calls[0].respond(ok({ id: 'a' }));
		await flush();
		expect(q.data.value).toEqual({ id: 'a' });
		expect(q.error.value).toBeNull();
	});

	test('errors の上書きが throw しても、報告して次の優先順の案内を error にし、refetch() は解決する', async () => {
		const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
		const boom = new Error('override threw');
		const q = inScope(() => useApiQuery('notes/show', {
			params: () => ({ noteId: 'a' }),
			manual: true,
			errors: { NO_SUCH_NOTE: () => { throw boom; } },
		}));
		const p = q.refetch();
		calls[0].respond(ng());
		await expect(p).resolves.toBeUndefined();
		expect(reported).toHaveBeenCalledExactlyOnceWith(boom);
		expect(q.error.value).toEqual({ guidance: { text: 'm\nx' }, failure: apiFailure });
		expect(q.isPending.value).toBe(false);
	});

	test('refetch() は reject せず、取得の終了・置き換え・中断で解決する', async () => {
		const id = ref('a');
		const enabled = ref(true);
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: id.value }), enabled: () => enabled.value }));

		// 終了 (失敗) で解決する
		const pFail = q.refetch();
		calls[1].respond(ng());
		await expect(pFail).resolves.toBeUndefined();

		// requestApi が万一 reject しても reject しない
		requestApiMock.mockRejectedValueOnce(new Error('unexpected'));
		await expect(q.refetch()).resolves.toBeUndefined();
		expect(q.error.value?.failure.kind).toBe('other');

		// 置き換えで解決する
		let replaced = false;
		const pReplaced = q.refetch().then(() => { replaced = true; });
		id.value = 'b';
		await flush();
		expect(replaced).toBe(true);
		await pReplaced;

		// 中断で解決する
		let aborted = false;
		const pAborted = q.refetch().then(() => { aborted = true; });
		enabled.value = false;
		await flush();
		expect(aborted).toBe(true);
		await pAborted;
	});

	test('scope の破棄で中断し、破棄後に届いた応答を無視する', async () => {
		const q = inScope(() => useApiQuery('notes/show', { params: () => ({ noteId: 'a' }) }));
		let settled = false;
		const p = q.refetch().then(() => { settled = true; });

		// 応答が届いた直後 (状態の更新より前) に破棄する
		calls[1].respond(ok({ id: 'a' }));
		q.scope.stop();
		expect(calls[1].opts.signal?.aborted).toBe(true);
		expect(calls[0].opts.signal?.aborted).toBe(true);
		await flush();

		expect(settled).toBe(true);
		await p;
		expect(q.data.value).toBeUndefined();
		expect(q.error.value).toBeNull();

		// 破棄後の失敗の応答も無視し、refetch も送らない
		calls[0].respond(ng());
		await flush();
		expect(q.error.value).toBeNull();
		await q.refetch();
		expect(calls).toHaveLength(2);
	});

	test('呼び元の params オブジェクトに i が書き込まれない', async () => {
		const params = { noteId: 'a' };
		inScope(() => useApiQuery('notes/show', { params: () => params }));
		expect(calls[0].params).toEqual(params);
		expect(calls[0].params).not.toBe(params);

		// 送信側がコピーに書き込んでも、呼び元にも比較用の値にも入らない
		calls[0].params.i = 'token';
		expect(params).toEqual({ noteId: 'a' });
		calls[0].respond(ok({ id: 'a' }));
		await flush();
	});
});

describe('useApiGetQuery', () => {
	test('method: GET で requestApi を呼ぶ', async () => {
		const q = inScope(() => useApiGetQuery('hashtags/trend'));
		expect(calls).toHaveLength(1);
		expect(calls[0].endpoint).toBe('hashtags/trend');
		expect(calls[0].params).toEqual({});
		expect(calls[0].opts.method).toBe('GET');

		calls[0].respond(ok([{ tag: 'misskey' }]));
		await flush();
		expect(q.data.value).toEqual([{ tag: 'misskey' }]);
	});
});
