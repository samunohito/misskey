/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Telemetry を有効にしただけで常時採取にならないための Misskey 既定値。 */
export const defaultTraceSampleRate = 0.01;

const additionalAttributeKeyPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,254}$/;
const sensitiveHeaderAttributePattern = /(?:^|[._-])(authorization|proxy[-_.]authorization|cookie|set[-_.]cookie|x[-_.]api[-_.]key)(?:$|[._-])/;

/**
 * Sentry/OTel の sampling 設定を Misskey の既定値より優先するか確認する。
 * 値の解釈自体は OTel SDK に委ね、未知の sampler 名を独自実装で上書きしない。
 */
export function hasOtelSamplerEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
	return typeof env.OTEL_TRACES_SAMPLER === 'string' && env.OTEL_TRACES_SAMPLER.trim() !== '';
}

export type TraceSamplerResolution =
	| { source: 'config'; sampleRate: number }
	| { source: 'environment' }
	| { source: 'default'; sampleRate: number };

/**
 * Misskeyの明示設定、OTel標準環境変数、Misskey既定値の優先順位を一箇所で決める。
 * environmentを返した場合はSDKの標準環境変数解釈へ委ねる。
 */
export function resolveTraceSampler(
	configuredSampleRate: unknown,
	env: NodeJS.ProcessEnv = process.env,
): TraceSamplerResolution {
	if (configuredSampleRate !== undefined) {
		if (typeof configuredSampleRate !== 'number' || !Number.isFinite(configuredSampleRate) || configuredSampleRate < 0 || configuredSampleRate > 1) {
			throw new Error('otelForBackend.sampleRate must be a number between 0.0 and 1.0.');
		}
		return { source: 'config', sampleRate: configuredSampleRate };
	}

	if (hasOtelSamplerEnvironment(env)) {
		return { source: 'environment' };
	}

	return { source: 'default', sampleRate: defaultTraceSampleRate };
}

/**
 * 外向き trace propagation 用の origin を、HTTP(S) の canonical origin に変換する。
 * undefined は未設定、空配列は明示的な「許可なし」として区別する。
 */
export function resolvePropagationAllowedOrigins(value: unknown): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new Error('otelForBackend.propagationAllowedOrigins must be an array of HTTP(S) origins.');
	}

	const origins = new Set<string>();
	for (const [index, raw] of value.entries()) {
		if (typeof raw !== 'string' || raw.length === 0 || raw.trim() !== raw || /[\s*]/.test(raw)) {
			throw new Error(`otelForBackend.propagationAllowedOrigins[${index}] must be an absolute HTTP(S) origin without userinfo, path, query, fragment, or wildcard.`);
		}

		let url: URL;
		try {
			url = new URL(raw);
		} catch {
			throw new Error(`otelForBackend.propagationAllowedOrigins[${index}] must be an absolute HTTP(S) origin without userinfo, path, query, fragment, or wildcard.`);
		}

		if (!['http:', 'https:'].includes(url.protocol)
			|| url.origin === 'null'
			|| url.username !== ''
			|| url.password !== ''
			|| url.pathname !== '/'
			|| url.search !== ''
			|| url.hash !== '') {
			throw new Error(`otelForBackend.propagationAllowedOrigins[${index}] must be an absolute HTTP(S) origin without userinfo, path, query, fragment, or wildcard.`);
		}

		origins.add(url.origin);
	}

	return [...origins];
}

/** Sentry の URL matcher 用に、canonical origin を exact-origin regex へ変換する。 */
export function buildSentryTracePropagationTargets(origins: readonly string[]): RegExp[] {
	return origins.map(origin => new RegExp(`^${escapeRegExp(origin)}(?:/|$)`));
}

/**
 * 既定の属性許可一覧へ追加するキーを検証する。
 * 置き換えではなく追加だけを受け付け、credential-bearing 属性は設定でも開けない。
 */
export function resolveAdditionalAllowedSpanAttributes(value: unknown): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new Error('otelForBackend.additionalAllowedSpanAttributes must be an array of attribute names.');
	}

	const attributes = new Set<string>();
	for (const [index, raw] of value.entries()) {
		if (typeof raw !== 'string' || !additionalAttributeKeyPattern.test(raw)) {
			throw new Error(`otelForBackend.additionalAllowedSpanAttributes[${index}] must be an ASCII attribute name up to 255 characters.`);
		}
		if (isForbiddenAdditionalAttributeKey(raw)) {
			throw new Error(`otelForBackend.additionalAllowedSpanAttributes[${index}] is not allowed because it may contain URL, query, database parameter, authorization, or cookie data.`);
		}
		attributes.add(raw);
	}

	return [...attributes];
}

export function isForbiddenAdditionalAttributeKey(key: string): boolean {
	const normalized = key.toLowerCase();
	if (normalized === 'url.path'
		|| normalized === 'url.query'
		|| normalized === 'http.target'
		|| normalized === 'http.url'
		|| normalized === 'db.statement'
		|| normalized === 'db.query.text'
		|| normalized === 'db.postgresql.values'
		|| normalized === 'db.query.parameter'
		|| normalized.startsWith('db.query.parameter.')) {
		return true;
	}

	return (normalized.startsWith('http.request.header.')
		|| normalized.startsWith('http.response.header.')
		|| normalized.startsWith('http.request.headers.')
		|| normalized.startsWith('http.response.headers.'))
		&& sensitiveHeaderAttributePattern.test(normalized);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
