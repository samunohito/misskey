/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { normalizeLogAttributes, normalizeLogMessage, serializeLogError } from '@/logging/LogNormalizer.js';
import { registerDiagLogger } from '@/core/telemetry/telemetry-diag.js';

const mocks = vi.hoisted(() => ({ writes: [] as unknown[], throwOnWrite: false }));

vi.mock('@/logger.js', () => ({
	default: class FakeLogger {
		public write(input: unknown): void {
			if (mocks.throwOnWrite) throw new Error('logger unavailable');
			mocks.writes.push(input);
		}
	},
}));

describe('telemetry-diag', () => {
	test('bridges diagnostic arguments as structured values and keeps errors in the logger error field', () => {
		mocks.writes.length = 0;
		const setLogger = vi.fn();
		registerDiagLogger({ setLogger } as any, 50);
		const diagLogger = setLogger.mock.calls[0][0] as { warn: (...args: unknown[]) => void };
		const error = new Error('collector https://user:password@collector.example/v1/traces?token=secret#fragment');
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		expect(() => diagLogger.warn('export failed at https://user:password@collector.example/v1/traces?token=secret#fragment', {
			authorization: 'Bearer secret',
			circular,
		}, error)).not.toThrow();

		const write = mocks.writes[0] as { level: string; eventName: string; message: string; attributes?: unknown; error?: unknown };
		expect(write.level).toBe('warn');
		expect(write.eventName).toBe('otel.diag');
		expect(write.error).toBe(error);
		expect(write.attributes).toEqual({ 'otel.diag.arguments': [{ authorization: 'Bearer secret', circular }] });

		const normalizedMessage = normalizeLogMessage(write.message);
		expect(normalizedMessage).toBe('export failed at https://collector.example/v1/traces');
		const normalizedAttributes = normalizeLogAttributes(write.attributes);
		expect(JSON.stringify(normalizedAttributes)).not.toContain('Bearer secret');
		expect(JSON.stringify(normalizedAttributes)).toContain('[Circular]');
		const normalizedError = serializeLogError(write.error);
		expect(JSON.stringify(normalizedError)).not.toContain('password@');
		expect(JSON.stringify(normalizedError)).not.toContain('?token=secret');
	});

	test('does not concatenate unbounded diagnostic arguments into a log message', () => {
		mocks.writes.length = 0;
		const setLogger = vi.fn();
		registerDiagLogger({ setLogger } as any, 50);
		const diagLogger = setLogger.mock.calls[0][0] as { error: (...args: unknown[]) => void };
		diagLogger.error('collector rejected', 'x'.repeat(100_000));

		const write = mocks.writes[0] as { message: string; attributes?: unknown };
		expect(write.message).toBe('collector rejected');
		expect(Buffer.byteLength(normalizeLogMessage(write.message), 'utf8')).toBeLessThanOrEqual(8 * 1024);
		expect(Buffer.byteLength(JSON.stringify(normalizeLogAttributes(write.attributes)), 'utf8')).toBeLessThanOrEqual(64 * 1024);
	});

	test('does not let a logger failure escape the diagnostic callback', () => {
		mocks.writes.length = 0;
		mocks.throwOnWrite = true;
		try {
			const setLogger = vi.fn();
			registerDiagLogger({ setLogger } as any, 50);
			const diagLogger = setLogger.mock.calls[0][0] as { warn: (...args: unknown[]) => void };
			expect(() => diagLogger.warn('logger unavailable')).not.toThrow();
		} finally {
			mocks.throwOnWrite = false;
		}
	});
});
