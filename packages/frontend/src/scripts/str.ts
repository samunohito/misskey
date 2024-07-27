/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function emptyStrToUndefined(value: string | null) {
	return value ? value : undefined;
}

export function emptyStrToNull(value: string | null) {
	return value === '' ? null : value;
}

export function emptyStrToEmptyArray(value: string) {
	return value === '' ? [] : value.split(',').map(it => it.trim());
}
