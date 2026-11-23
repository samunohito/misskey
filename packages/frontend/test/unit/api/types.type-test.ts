/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 型だけのテスト。Vitest では実行せず、`pnpm --filter frontend typecheck` (vue-tsc) で確かめる。

import { expectTypeOf } from 'vitest';
import type * as Misskey from 'misskey-js';
import type { ApiResponse, JsonEndpoint } from '@/utility/api/types.js';
import type { ApiActionResult } from '@/composables/use-api-action.js';
import { useApiAction } from '@/composables/use-api-action.js';
import { useApiGetQuery, useApiQuery } from '@/composables/use-api-query.js';

type UserDetailed = Misskey.entities.UserDetailed;
type SigninWithPasskeyResponse = Misskey.entities.SigninWithPasskeyResponse;
type SigninWithPasskeyInitResponse = Misskey.entities.SigninWithPasskeyInitResponse;

declare const flag: boolean;

// 単体
expectTypeOf<ApiResponse<'users/show', { userId: string }>>().toEqualTypeOf<UserDetailed>();
expectTypeOf<ApiResponse<'users/show', { username: string; host?: string | null }>>().toEqualTypeOf<UserDetailed>();
// 配列
expectTypeOf<ApiResponse<'users/show', { userIds: string[] }>>().toEqualTypeOf<UserDetailed[]>();
// 和を明示
expectTypeOf<ApiResponse<'users/show', { userId: string } | { userIds: string[] }>>().toEqualTypeOf<UserDetailed | UserDetailed[]>();
// 型注釈のない条件式
const p = flag ? { userId: 'a' } : { userIds: ['b'] };
expectTypeOf<ApiResponse<'users/show', typeof p>>().toEqualTypeOf<UserDetailed | UserDetailed[]>();
// userIds が省略可能
expectTypeOf<ApiResponse<'users/show', { userId: string; userIds?: string[] }>>().toEqualTypeOf<UserDetailed | UserDetailed[]>();
// req の型そのもの (どの形か決まらない)
expectTypeOf<ApiResponse<'users/show', Misskey.Endpoints['users/show']['req']>>().toEqualTypeOf<UserDetailed | UserDetailed[]>();
// 必須の条件を持つ case
expectTypeOf<ApiResponse<'signin-with-passkey', { context: string }>>().toEqualTypeOf<SigninWithPasskeyResponse>();
expectTypeOf<ApiResponse<'signin-with-passkey', { credential?: undefined }>>().toEqualTypeOf<SigninWithPasskeyInitResponse>();
expectTypeOf<ApiResponse<'signin-with-passkey', { context?: string }>>().toEqualTypeOf<SigninWithPasskeyResponse | SigninWithPasskeyInitResponse>();
// SwitchCase でないエンドポイントは Endpoints[E]['res'] のまま
expectTypeOf<ApiResponse<'i', Record<string, never>>>().toEqualTypeOf<Misskey.Endpoints['i']['res']>();

// JSON エンドポイント
expectTypeOf<'users/show'>().toExtend<JsonEndpoint>();
// @ts-expect-error multipart は JsonEndpoint に含まれない
const _x: JsonEndpoint = 'drive/files/create';

// composable への組み込み (呼ばないので実行時には何もしない)
function _composables() {
	const { execute } = useApiAction('users/show');
	expectTypeOf(execute({ userIds: ['a'] })).resolves.toEqualTypeOf<ApiActionResult<UserDetailed[]>>();
	expectTypeOf(execute({ userId: 'a' })).resolves.toEqualTypeOf<ApiActionResult<UserDetailed>>();

	const q = useApiQuery('users/show', { params: () => ({ userIds: ['a'] }) });
	expectTypeOf(q.data.value).toEqualTypeOf<UserDetailed[] | undefined>();

	const g = useApiGetQuery('users/show', { params: () => ({ userId: 'a' }) });
	expectTypeOf(g.data.value).toEqualTypeOf<UserDetailed | undefined>();

	// @ts-expect-error multipart は受け付けない
	useApiAction('drive/files/create');
	// @ts-expect-error multipart は受け付けない
	useApiQuery('drive/files/create');
}
