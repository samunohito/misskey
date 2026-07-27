/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	createApiEndpointFailedEvent,
	createClientRequestFailedEvent,
	createQueueJobFailedEvent,
	createSensitiveDetectionFailedEvent,
	createUrlPreviewFailedEvent,
	normalizeOperationalEvent,
} from '@/logging/OperationalLogEvents.js';

describe('OperationalLogEvents', () => {
	test('keeps API failures metadata-only', () => {
		const event = createApiEndpointFailedEvent('users/show', new Error('password=DO_NOT_EXPORT'), 'error-1');

		expect(event).not.toHaveProperty('error');
		expect(event).toEqual({
			level: 'error',
			eventName: 'api.endpoint.failed',
			message: 'API endpoint failed',
			attributes: {
				'api.endpoint': 'users/show',
				'error.id': 'error-1',
				'error.type': 'Error',
			},
		});
	});

	test('retains queue metadata and strips destination path/query', () => {
		const event = createQueueJobFailedEvent({
			queueName: 'deliver',
			jobName: 'deliver',
			jobId: 'job-1',
			attemptsMade: 2,
			attemptsMax: 5,
			destinationOrigin: 'https://example.test',
		}, new TypeError('DO_NOT_EXPORT'), 'error-2');

		const normalized = normalizeOperationalEvent(event);
		expect(normalized.attributes).toMatchObject({
			'queue.name': 'deliver',
			'queue.job.id': 'job-1',
			'queue.job.attempts_made': 2,
			'destination.origin': 'https://example.test',
			'error.type': 'TypeError',
		});
		expect(JSON.stringify(normalized)).not.toContain('DO_NOT_EXPORT');
	});

	test('URL preview retains only a valid origin', () => {
		const event = createUrlPreviewFailedEvent('https://user:password@example.test/private?token=DO_NOT_EXPORT', new Error('failed'));

		expect(event.attributes).toEqual({
			'url.origin': 'https://example.test',
			'error.type': 'Error',
		});
	});

	test('AI and client events use fixed messages and stable fields', () => {
		expect(createSensitiveDetectionFailedEvent({ failureKind: 'invalid_shape' }, new Error('body=DO_NOT_EXPORT'))).toEqual({
			level: 'warn',
			eventName: 'ai.sensitive_detection.failed',
			message: 'Sensitive media detection failed',
			attributes: { 'failure.kind': 'invalid_shape', 'error.type': 'Error' },
		});
		expect(createClientRequestFailedEvent('/notes/create', 500, new Error('query=DO_NOT_EXPORT'), 'error-3').attributes).toMatchObject({
			'http.route': '/notes/create',
			'http.response.status_code': 500,
			'error.id': 'error-3',
		});
	});
});
