/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// このファイルは vue-tsc の型検査で確かめる。

import { expectTypeOf } from 'vitest';
import type * as Misskey from 'misskey-js';
import type { ApiResponse, JsonEndpoint } from '@/utility/api/types.js';
import { useApiGetQuery, useApiQuery } from '@/composables/use-api-query.js';

type UserDetailed = Misskey.entities.UserDetailed;
type SigninWithPasskeyResponse = Misskey.entities.SigninWithPasskeyResponse;
type SigninWithPasskeyInitResponse = Misskey.entities.SigninWithPasskeyInitResponse;

declare const flag: boolean;

expectTypeOf<ApiResponse<'users/show', { userId: string }>>().toEqualTypeOf<UserDetailed>();
expectTypeOf<ApiResponse<'users/show', { username: string; host?: string | null }>>().toEqualTypeOf<UserDetailed>();
expectTypeOf<ApiResponse<'users/show', { userIds: string[] }>>().toEqualTypeOf<UserDetailed[]>();
expectTypeOf<ApiResponse<'users/show', { userId: string } | { userIds: string[] }>>().toEqualTypeOf<UserDetailed | UserDetailed[]>();
// 条件式の推論で補われる省略可能なキーがあっても、両方の応答を残す。
const p = flag ? { userId: 'a' } : { userIds: ['b'] };
expectTypeOf<ApiResponse<'users/show', typeof p>>().toEqualTypeOf<UserDetailed | UserDetailed[]>();
// userIds の有無で応答が変わるため、型から有無が決まらない場合は両方を含める。
expectTypeOf<ApiResponse<'users/show', { userId: string; userIds?: string[] }>>().toEqualTypeOf<UserDetailed | UserDetailed[]>();
expectTypeOf<ApiResponse<'users/show', Misskey.Endpoints['users/show']['req']>>().toEqualTypeOf<UserDetailed | UserDetailed[]>();

expectTypeOf<ApiResponse<'signin-with-passkey', { context: string }>>().toEqualTypeOf<SigninWithPasskeyResponse>();
expectTypeOf<ApiResponse<'signin-with-passkey', { credential?: undefined }>>().toEqualTypeOf<SigninWithPasskeyInitResponse>();
// context が認証結果を選ぶ条件なので、省略できる場合は初期化応答も候補に残る。
expectTypeOf<ApiResponse<'signin-with-passkey', { context?: string }>>().toEqualTypeOf<SigninWithPasskeyResponse | SigninWithPasskeyInitResponse>();

expectTypeOf<ApiResponse<'i', Record<string, never>>>().toEqualTypeOf<Misskey.Endpoints['i']['res']>();

expectTypeOf<'users/show'>().toExtend<JsonEndpoint>();
// @ts-expect-error multipart は JsonEndpoint に含まれない
const _x: JsonEndpoint = 'drive/files/create';

// 呼び出し式の型だけを検査できるよう、composable は実行されない関数に置く。
function _composables() {
	const q = useApiQuery('users/show', { params: () => ({ userIds: ['a'] }) });
	expectTypeOf(q.data.value).toEqualTypeOf<UserDetailed[] | undefined>();

	const g = useApiGetQuery('hashtags/trend');
	expectTypeOf(g.data.value).toEqualTypeOf<Misskey.entities.HashtagsTrendResponse | undefined>();

	// @ts-expect-error multipart は受け付けない
	useApiQuery('drive/files/create');

	// @ts-expect-error 必須の項目があるエンドポイントでは params を省けない
	useApiQuery('notes/show');
	// @ts-expect-error 必須の項目があるエンドポイントでは params を省けない
	useApiQuery('notes/show', { manual: true });
	// エンドポイントが union なら、どれか1つでも必須の項目があれば params を省けない
	const ep = 'meta' as 'meta' | 'notes/show';
	// @ts-expect-error 必須の項目があるエンドポイントを含む
	useApiQuery(ep);
	// 必須の項目がないエンドポイントでは params を省ける
	useApiQuery('meta');
	useApiQuery('meta', { manual: true });
}
