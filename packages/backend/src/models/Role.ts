/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Column, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

/**
 * ～かつ～
 * 複数の条件を同時に満たす場合のみ成立とする
 */
export type CondFormulaValueAnd = {
	type: 'and';
	values: RoleCondFormulaValue[];
};

/**
 * ～または～
 * 複数の条件のうち、いずれかを満たす場合のみ成立とする
 */
type CondFormulaValueOr = {
	type: 'or';
	values: RoleCondFormulaValue[];
};

/**
 * ～ではない
 * 条件を満たさない場合のみ成立とする
 */
type CondFormulaValueNot = {
	type: 'not';
	value: RoleCondFormulaValue;
};

/**
 * ローカルユーザーのみ成立とする
 */
type CondFormulaValueIsLocal = {
	type: 'isLocal';
};

/**
 * リモートユーザーのみ成立とする
 */
type CondFormulaValueIsRemote = {
	type: 'isRemote';
};

/**
 * 既に指定のマニュアルロールにアサインされている場合のみ成立とする
 */
type CondFormulaValueRoleAssignedTo = {
	type: 'roleAssignedTo';
	roleId: string;
};

/**
 * ドライブの使用容量が指定値以下の場合のみ成立とする
 */
type CondFormulaValueDriveUsageLessThanOrEq = {
	type: 'driveUsageLessThanOrEq';
	usageSize: number;
};

/**
 * ドライブの使用容量が指定値以上の場合のみ成立とする
 */
type CondFormulaValueDriveUsageMoreThanOrEq = {
	type: 'driveUsageMoreThanOrEq';
	usageSize: number;
};

/**
 * botアカウントの場合のみ成立とする
 */
type CondFormulaValueIsBot = {
	type: 'isBot';
};

/**
 * サスペンド済みアカウントの場合のみ成立とする
 */
type CondFormulaValueIsSuspended = {
	type: 'isSuspended';
};

/**
 * 猫アカウントの場合のみ成立とする
 */
type CondFormulaValueIsCat = {
	type: 'isCat';
};

/**
 * セキュリティキーの登録が完了している場合のみ成立とする
 */
type CondFormulaValueHasSecurityKey = {
	type: 'hasSecurityKey';
};

/**
 * 2段階認証の登録が完了している場合のみ成立とする
 */
type CondFormulaValueHasTwoFactorAuth = {
	type: 'hasTwoFactorAuth';
};

/**
 * メールアドレスの確認が完了している場合のみ成立とする
 */
type CondFormulaValueHasEmailVerified = {
	type: 'hasEmailVerified';
};

/**
 * パスワードレスログインが有効化されている場合のみ成立とする
 */
type CondFormulaValueHasPasswordLessLogin = {
	type: 'hasPasswordLessLogin';
};

/**
 * サーバの現在日時＝誕生日な場合のみ成立する
 */
type CondFormulaValueBirthday = {
	type: 'birthday';
};

/**
 * アカウント作成から指定期間以内の場合のみ成立とする
 */
type CondFormulaValueCreatedLessThan = {
	type: 'createdLessThan';
	sec: number;
};

/**
 * アカウント作成から指定期間経過の場合のみ成立とする
 */
type CondFormulaValueCreatedMoreThan = {
	type: 'createdMoreThan';
	sec: number;
};

/**
 * ユーザ情報の最終更新日時が指定値以下の場合のみ成立とする
 */
type CondFormulaValueUserInfoUpdatedLessThan = {
	type: 'userInfoUpdatedLessThan';
	sec: number;
};

/**
 * ユーザ情報の最終更新日時が指定値以上の場合のみ成立とする
 */
type CondFormulaValueUserInfoUpdatedMoreThan = {
	type: 'userInfoUpdatedMoreThan';
	sec: number;
};

/**
 * 通算ログイン日数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueLoginDaysLessThanOrEq = {
	type: 'loginDaysLessThanOrEq';
	day: number;
};

/**
 * 通算ログイン日数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueLoginDaysMoreThanOrEq = {
	type: 'loginDaysMoreThanOrEq';
	day: number;
};

/**
 * フォロワー数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueFollowersLessThanOrEq = {
	type: 'followersLessThanOrEq';
	count: number;
};

/**
 * フォロワー数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueFollowersMoreThanOrEq = {
	type: 'followersMoreThanOrEq';
	count: number;
};

/**
 * フォロー数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueFollowingLessThanOrEq = {
	type: 'followingLessThanOrEq';
	count: number;
};

/**
 * フォロー数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueFollowingMoreThanOrEq = {
	type: 'followingMoreThanOrEq';
	count: number;
};

/**
 * リアクションした数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueReactionsLessThanOrEq = {
	type: 'reactionsLessThanOrEq';
	count: number;
};

/**
 * リアクションした数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueReactionsMoreThanOrEq = {
	type: 'reactionsMoreThanOrEq';
	count: number;
};

/**
 * リアクションされた数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueReactionsReceivedLessThanOrEq = {
	type: 'reactionsReceivedLessThanOrEq';
	count: number;
};

/**
 * リアクションされた数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueReactionsReceivedMoreThanOrEq = {
	type: 'reactionsReceivedMoreThanOrEq';
	count: number;
};

/**
 * リノートした数が指定値の数以下の場合のみ成立とする
 */
type CondFormulaValueRenotesLessThanOrEq = {
	type: 'renotesLessThanOrEq';
	count: number;
};

/**
 * リノートした数が指定値の数以上の場合のみ成立とする
 */
type CondFormulaValueRenotesMoreThanOrEq = {
	type: 'renotesMoreThanOrEq';
	count: number;
};

/**
 * リノートされた数が指定値の数以下の場合のみ成立とする
 */
type CondFormulaValueRenotesReceivedLessThanOrEq = {
	type: 'renotesReceivedLessThanOrEq';
	count: number;
};

/**
 * リノートされた数が指定値の数以上の場合のみ成立とする
 */
type CondFormulaValueRenotesReceivedMoreThanOrEq = {
	type: 'renotesReceivedMoreThanOrEq';
	count: number;
};

/**
 * リプライした数が指定値の数以下の場合のみ成立とする
 */
type CondFormulaValueRepliesLessThanOrEq = {
	type: 'repliesLessThanOrEq';
	count: number;
};

/**
 * リプライした数が指定値の数以上の場合のみ成立とする
 */
type CondFormulaValueRepliesMoreThanOrEq = {
	type: 'repliesMoreThanOrEq';
	count: number;
};

/**
 * リプライされた数が指定値の数以下の場合のみ成立とする
 */
type CondFormulaValueRepliesReceivedLessThanOrEq = {
	type: 'repliesReceivedLessThanOrEq';
	count: number;
};

/**
 * リプライされた数が指定値の数以上の場合のみ成立とする
 */
type CondFormulaValueRepliesReceivedMoreThanOrEq = {
	type: 'repliesReceivedMoreThanOrEq';
	count: number;
};

/**
 * 投稿数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueNotesLessThanOrEq = {
	type: 'notesLessThanOrEq';
	count: number;
};

/**
 * 投稿数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueNotesMoreThanOrEq = {
	type: 'notesMoreThanOrEq';
	count: number;
};

/**
 * 投票数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueVotesLessThanOrEq = {
	type: 'votesLessThanOrEq';
	count: number;
};

/**
 * 投票数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueVotesMoreThanOrEq = {
	type: 'votesMoreThanOrEq';
	count: number;
};

/**
 * 投票された数が指定値以下の場合のみ成立とする
 */
type CondFormulaValueVotesReceivedLessThanOrEq = {
	type: 'votesReceivedLessThanOrEq';
	count: number;
};

/**
 * 投票された数が指定値以上の場合のみ成立とする
 */
type CondFormulaValueVotesReceivedMoreThanOrEq = {
	type: 'votesReceivedMoreThanOrEq';
	count: number;
};

export type RoleCondFormulaValue = { id: string } & (
	CondFormulaValueAnd |
	CondFormulaValueOr |
	CondFormulaValueNot |
	CondFormulaValueIsLocal |
	CondFormulaValueIsRemote |
	CondFormulaValueRoleAssignedTo |
	CondFormulaValueDriveUsageLessThanOrEq |
	CondFormulaValueDriveUsageMoreThanOrEq |
	CondFormulaValueIsBot |
	CondFormulaValueIsSuspended |
	CondFormulaValueIsCat |
	CondFormulaValueHasSecurityKey |
	CondFormulaValueHasTwoFactorAuth |
	CondFormulaValueHasEmailVerified |
	CondFormulaValueHasPasswordLessLogin |
	CondFormulaValueBirthday |
	CondFormulaValueCreatedLessThan |
	CondFormulaValueCreatedMoreThan |
	CondFormulaValueLoginDaysLessThanOrEq |
	CondFormulaValueLoginDaysMoreThanOrEq |
	CondFormulaValueUserInfoUpdatedLessThan |
	CondFormulaValueUserInfoUpdatedMoreThan |
	CondFormulaValueFollowersLessThanOrEq |
	CondFormulaValueFollowersMoreThanOrEq |
	CondFormulaValueFollowingLessThanOrEq |
	CondFormulaValueFollowingMoreThanOrEq |
	CondFormulaValueReactionsLessThanOrEq |
	CondFormulaValueReactionsMoreThanOrEq |
	CondFormulaValueReactionsReceivedLessThanOrEq |
	CondFormulaValueReactionsReceivedMoreThanOrEq |
	CondFormulaValueRenotesLessThanOrEq |
	CondFormulaValueRenotesMoreThanOrEq |
	CondFormulaValueRenotesReceivedLessThanOrEq |
	CondFormulaValueRenotesReceivedMoreThanOrEq |
	CondFormulaValueRepliesLessThanOrEq |
	CondFormulaValueRepliesMoreThanOrEq |
	CondFormulaValueRepliesReceivedLessThanOrEq |
	CondFormulaValueRepliesReceivedMoreThanOrEq |
	CondFormulaValueNotesLessThanOrEq |
	CondFormulaValueNotesMoreThanOrEq |
	CondFormulaValueVotesLessThanOrEq |
	CondFormulaValueVotesMoreThanOrEq |
	CondFormulaValueVotesReceivedLessThanOrEq |
	CondFormulaValueVotesReceivedMoreThanOrEq
);

@Entity('role')
export class MiRole {
	@PrimaryColumn(id())
	public id: string;

	@Column('timestamp with time zone', {
		comment: 'The updated date of the Role.',
	})
	public updatedAt: Date;

	@Column('timestamp with time zone', {
		comment: 'The last used date of the Role.',
	})
	public lastUsedAt: Date;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Column('varchar', {
		length: 1024,
	})
	public description: string;

	@Column('varchar', {
		length: 256, nullable: true,
	})
	public color: string | null;

	@Column('varchar', {
		length: 512, nullable: true,
	})
	public iconUrl: string | null;

	@Column('enum', {
		enum: ['manual', 'conditional'],
		default: 'manual',
	})
	public target: 'manual' | 'conditional';

	@Column('jsonb', {
		default: { },
	})
	public condFormula: RoleCondFormulaValue;

	@Column('boolean', {
		default: false,
	})
	public isPublic: boolean;

	// trueの場合ユーザー名の横にバッジとして表示
	@Column('boolean', {
		default: false,
	})
	public asBadge: boolean;

	@Column('boolean', {
		default: false,
	})
	public isModerator: boolean;

	@Column('boolean', {
		default: false,
	})
	public isAdministrator: boolean;

	@Column('boolean', {
		default: false,
	})
	public isExplorable: boolean;

	@Column('boolean', {
		default: false,
	})
	public canEditMembersByModerator: boolean;

	// UIに表示する際の並び順用(大きいほど先頭)
	@Column('integer', {
		default: 0,
	})
	public displayOrder: number;

	@Column('jsonb', {
		default: { },
	})
	public policies: Record<string, {
		useDefault: boolean;
		priority: number;
		value: any;
	}>;
}
