/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

/** JSON で送信できるエンドポイント。multipart の `drive/files/create` は対象外。 */
// TODO(api-error-types): generator の endpointReqTypes から作る (misskey-js の endpointReqTypes は公開されていないため、今は手で除く)
export type JsonEndpoint = Exclude<keyof Misskey.Endpoints, 'drive/files/create'>;

type IsNever<T> = [T] extends [never] ? true : false;

/**
 * Q のキーのうち C にもあり、undefined 以外の値を取りうるもの。
 */
type PresentKeys<Q, C> = {
	[K in keyof Q & keyof C]-?: IsNever<Exclude<Q[K], undefined>> extends true ? never : K;
}[keyof Q & keyof C];

/**
 * case の条件のキーがすべて渡りうるか (当たる可能性があるか)。
 */
type MayMatch<Q, C> = IsNever<Exclude<keyof C, PresentKeys<Q, C>>>;

/**
 * 1つの形の params について、返りうる応答をすべて集める。
 * - 確実に当たる case (条件のキーがすべて必須) があれば、そこで止める。
 * - 当たるかどうか型から決まらない case は、その結果を含めて先へ進む。
 * - 確実に当たる case がなければ `$default` を含める。
 */
type CollectCaseResults<Q, Cases, Default> =
	Cases extends readonly [infer Head, ...infer Rest]
		? Head extends readonly [infer C, infer R]
			? Q extends Required<C>
				? R
				: MayMatch<Q, C> extends true
					? R | CollectCaseResults<Q, Rest, Default>
					: CollectCaseResults<Q, Rest, Default>
			: CollectCaseResults<Q, Rest, Default>
		: Default;

type DistributeParams<P, Cases, Default> = P extends unknown ? CollectCaseResults<P, Cases, Default> : never;

/**
 * パラメーターの型から、エンドポイントが返しうる応答を求める。
 *
 * `SwitchCaseResponseType` では任意のキーを含む条件で応答を狭めすぎることがあるため、
 * `$switch` は `P` のユニオンの要素ごとに判定し、当たりうる条件の応答をすべて含める。
 */
export type ApiResponse<E extends keyof Misskey.Endpoints, P extends Misskey.Endpoints[E]['req']> =
	Misskey.Endpoints[E]['res'] extends { $switch: { $cases: infer Cases; $default: infer Default } }
		? DistributeParams<P, Cases, Default>
		: Misskey.Endpoints[E]['res'];
