/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { normalizeLogAttributes, normalizeLogMessage } from './LogNormalizer.js';
import type { LogEntryInput, LogLevel, LogAttributeValue } from './types.js';

/** MisskeyがLoggerとTelemetryへ同時に渡す、低カーディナリティの運用イベントです。 */
export type OperationalEventName =
	| 'api.endpoint.failed'
	| 'queue.job.failed'
	| 'url_preview.failed'
	| 'ai.sensitive_detection.failed'
	| 'http.server.request.failed';

/** event attributesへ渡せるプリミティブ値です。任意objectはsource側で要約してから渡します。 */
export type OperationalEventAttributes = Readonly<Record<string, string | number | boolean>>;

/** Logger/Telemetryが共有する、sinkへ渡す前の運用イベントです。 */
export type OperationalEvent = Omit<LogEntryInput, 'error' | 'eventName' | 'attributes'> & {
	readonly level: Extract<LogLevel, 'debug' | 'info' | 'warn' | 'error'>;
	readonly eventName: OperationalEventName;
	readonly attributes: OperationalEventAttributes;
};

/** Loggerへ渡すQueue metadataです。job payloadは含めません。 */
export type QueueOperationalMetadata = {
	readonly queueName: string;
	readonly jobName?: string;
	readonly jobId?: string | number;
	readonly attemptsMade?: number;
	readonly attemptsMax?: number;
	readonly destinationOrigin?: string;
};

/** AI detectorが返す失敗分類です。response bodyやremote error codeは含めません。 */
export type SensitiveDetectionFailureKind =
	| 'invalid_configuration'
	| 'http_status'
	| 'invalid_content_type'
	| 'invalid_shape'
	| 'remote_failure'
	| 'result_count_mismatch'
	| 'timeout'
	| 'request_error';

function errorType(error: unknown): string {
	const type = error instanceof Error ? (error.name || 'Error') : typeof error;
	return /^[A-Za-z0-9._:-]{1,128}$/.test(type) ? type : 'Error';
}

/** API endpointの失敗を、paramsなしの固定schemaへ変換します。 */
export function createApiEndpointFailedEvent(endpoint: string, error: unknown, errorId: string = randomUUID()): OperationalEvent {
	return {
		level: 'error',
		eventName: 'api.endpoint.failed',
		message: 'API endpoint failed',
		attributes: {
			'api.endpoint': endpoint,
			'error.id': errorId,
			'error.type': errorType(error),
		},
	};
}

/** Queue jobの失敗を、運用に必要なjob metadataだけへ変換します。 */
export function createQueueJobFailedEvent(metadata: QueueOperationalMetadata, error: unknown, errorId: string = randomUUID()): OperationalEvent {
	return {
		level: 'error',
		eventName: 'queue.job.failed',
		message: 'Queue job failed',
		attributes: {
			'queue.name': metadata.queueName,
			...(metadata.jobName != null ? { 'queue.job.name': metadata.jobName } : {}),
			...(metadata.jobId != null ? { 'queue.job.id': String(metadata.jobId) } : {}),
			...(metadata.attemptsMade != null ? { 'queue.job.attempts_made': metadata.attemptsMade } : {}),
			...(metadata.attemptsMax != null ? { 'queue.job.attempts_max': metadata.attemptsMax } : {}),
			...(metadata.destinationOrigin != null ? { 'destination.origin': metadata.destinationOrigin } : {}),
			'error.id': errorId,
			'error.type': errorType(error),
		},
	};
}

/** URL preview failureをoriginだけのmetadataへ変換します。 */
export function createUrlPreviewFailedEvent(url: string, error: unknown): OperationalEvent {
	let origin: string | undefined;
	try {
		origin = new URL(url).origin;
	} catch {
		origin = undefined;
	}

	return {
		level: 'warn',
		eventName: 'url_preview.failed',
		message: 'URL preview failed',
		attributes: {
			...(origin != null && origin !== 'null' ? { 'url.origin': origin } : {}),
			'error.type': errorType(error),
		},
	};
}

/** AI detector failureをresponse bodyなしのmetadataへ変換します。 */
export function createSensitiveDetectionFailedEvent(
	options: { readonly failureKind: SensitiveDetectionFailureKind; readonly statusCode?: number },
	error?: unknown,
): OperationalEvent {
	return {
		level: 'warn',
		eventName: 'ai.sensitive_detection.failed',
		message: 'Sensitive media detection failed',
		attributes: {
			'failure.kind': options.failureKind,
			...(options.statusCode != null ? { 'http.response.status_code': options.statusCode } : {}),
			...(typeof error !== 'undefined' ? { 'error.type': errorType(error) } : {}),
		},
	};
}

/** ClientServerServiceの失敗をqueryなしのmetadataへ変換します。 */
export function createClientRequestFailedEvent(route: string, statusCode: number, error: unknown, errorId: string = randomUUID()): OperationalEvent {
	return {
		level: 'error',
		eventName: 'http.server.request.failed',
		message: 'HTTP server request failed',
		attributes: {
			'http.route': route,
			'http.response.status_code': statusCode,
			'error.id': errorId,
			'error.type': errorType(error),
		},
	};
}

/** Operational eventをTelemetry adapterへ渡す前に、固定messageとattributesを共通正規化します。 */
export type NormalizedOperationalEvent = {
	readonly level: OperationalEvent['level'];
	readonly eventName: OperationalEventName;
	readonly message: string;
	readonly attributes: LogAttributesPrimitive;
};

type LogAttributesPrimitive = Readonly<Record<string, string | number | boolean>>;

function primitiveAttributes(value: LogAttributeValue): LogAttributesPrimitive {
	if (value == null || Array.isArray(value) || typeof value !== 'object') return {};
	const result: Record<string, string | number | boolean> = {};
	for (const [key, child] of Object.entries(value)) {
		if (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean') result[key] = child;
	}
	return result;
}

/** LoggerとSentry/OTelで同じ安全なevent内容を使用します。 */
export function normalizeOperationalEvent(event: OperationalEvent): NormalizedOperationalEvent {
	const attributes = primitiveAttributes(normalizeLogAttributes(event.attributes));
	return {
		level: event.level,
		eventName: event.eventName,
		message: normalizeLogMessage(event.message),
		attributes,
	};
}
