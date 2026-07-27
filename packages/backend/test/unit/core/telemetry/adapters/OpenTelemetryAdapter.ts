/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ROOT_CONTEXT, SamplingDecision, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { defaultResource, detectResources, envDetector, resourceFromAttributes } from '@opentelemetry/resources';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OpenTelemetryAdapter, createResource, createSampler, getMisskeyProcessRole } from '@/core/telemetry/adapters/OpenTelemetryAdapter.js';
import { defaultTraceSampleRate, hasOtelSamplerEnvironment, resolveTraceSampler } from '@/core/telemetry/observability-config.js';
import { createApiEndpointFailedEvent } from '@/logging/OperationalLogEvents.js';
import type { Context, Span, SpanContext } from '@opentelemetry/api';

const mocks = vi.hoisted(() => {
	return {
		envOption: {
			disableClustering: false,
			onlyServer: false,
			onlyQueue: false,
		},
		isPrimary: false,
	};
});

vi.mock('@/env.js', () => ({
	envOption: mocks.envOption,
}));

vi.mock('node:cluster', () => ({
	default: {
		get isPrimary() {
			return mocks.isPrimary;
		},
	},
}));

const samplerDeps = {
	ParentBasedSampler,
	TraceIdRatioBasedSampler,
};

describe('OpenTelemetryAdapter', () => {
	test('wraps async work in an active span and ends it after success', async () => {
		const span = {
			end: vi.fn(),
			recordException: vi.fn(),
			setStatus: vi.fn(),
		};
		const tracer = {
			startActiveSpan: vi.fn(async (_name: string, fn: (spanArg: any) => Promise<string>) => fn(span)),
		} as any;
		const provider = {
			shutdown: vi.fn(),
		};
		const adapter = new OpenTelemetryAdapter({
			tracer,
			provider,
			getActiveSpan: () => undefined,
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 10,
		});

		await expect(adapter.startSpan('API: test', async () => 'ok')).resolves.toBe('ok');

		expect(tracer.startActiveSpan).toHaveBeenCalledWith('API: test', expect.any(Function));
		expect(span.recordException).not.toHaveBeenCalled();
		expect(span.setStatus).not.toHaveBeenCalled();
		expect(span.end).toHaveBeenCalledTimes(1);
	});

	test('records thrown errors on the active span before rethrowing', async () => {
		const error = new Error('boom');
		const span = {
			end: vi.fn(),
			recordException: vi.fn(),
			setStatus: vi.fn(),
		};
		const tracer = {
			startActiveSpan: vi.fn(async (_name: string, fn: (spanArg: any) => Promise<void>) => fn(span)),
		} as any;
		const adapter = new OpenTelemetryAdapter({
			tracer,
			provider: { shutdown: vi.fn() },
			getActiveSpan: () => undefined,
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 10,
		});

		await expect(adapter.startSpan('Queue: test', async () => {
			throw error;
		})).rejects.toThrow(error);

		expect(span.recordException).toHaveBeenCalledWith(error);
		expect(span.setStatus).toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
			message: error.message,
		});
		expect(span.end).toHaveBeenCalledTimes(1);
	});

	test('creates a root worker span linked to the enqueue span by default', () => {
		const span = {
			end: vi.fn(),
			recordException: vi.fn(),
			setStatus: vi.fn(),
		};
		const rootContext = {} as Context;
		const extractedContext = {} as Context;
		const sourceSpanContext = {
			traceId: '0123456789abcdef0123456789abcdef',
			spanId: '0123456789abcdef',
			traceFlags: 1,
			isRemote: true,
		} as SpanContext;
		const propagation = {
			isPropagationApi: true,
			inject: vi.fn(),
			extract(this: { isPropagationApi: boolean }) {
				if (!this.isPropagationApi) {
					throw new Error('lost propagation API receiver');
				}
				return extractedContext;
			},
		};
		const tracer = {
			startActiveSpan: vi.fn((_name: string, _options: unknown, _context: unknown, fn: (spanArg: typeof span) => string) => fn(span)),
		} as any;
		const adapter = new OpenTelemetryAdapter({
			tracer,
			provider: { shutdown: vi.fn() },
			getActiveSpan: () => undefined,
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 10,
			queueTraceContext: {
				tracer,
				propagation: propagation as any,
				trace: { getSpanContext: () => sourceSpanContext },
				getActiveContext: () => rootContext,
				rootContext,
				mode: 'link',
				spanStatusCodeError: SpanStatusCode.ERROR,
			},
		});

		expect(adapter.startSpanWithTraceContext('Queue: Deliver', {
			__misskeyTraceContext: {
				traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
			},
		}, () => 'ok')).toBe('ok');

		expect(tracer.startActiveSpan).toHaveBeenCalledWith('Queue: Deliver', {
			root: true,
			links: [{ context: sourceSpanContext }],
		}, rootContext, expect.any(Function));
		expect(span.end).toHaveBeenCalledTimes(1);
	});

	test('returns the active span context for log enrichment', () => {
		const adapter = new OpenTelemetryAdapter({
			tracer: { startActiveSpan: vi.fn() },
			provider: { shutdown: vi.fn() },
			getActiveSpan: () => ({
				spanContext: () => ({
					traceId: '0123456789abcdef0123456789abcdef',
					spanId: '0123456789abcdef',
					traceFlags: 0,
				}),
			} as any),
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 10,
		});

		expect(adapter.getActiveTraceContext()).toEqual({
			traceId: '0123456789abcdef0123456789abcdef',
			spanId: '0123456789abcdef',
			traceFlags: 0,
		});
	});

	test('bridges captureMessage to the active span when one exists', () => {
		const activeSpan = {
			recordException: vi.fn(),
			setStatus: vi.fn(),
			setAttributes: vi.fn(),
		};
		const adapter = new OpenTelemetryAdapter({
			tracer: { startActiveSpan: vi.fn() },
			provider: { shutdown: vi.fn() },
			getActiveSpan: () => activeSpan as unknown as Span,
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 10,
		});

		adapter.captureMessage('Queue failed', {
			level: 'error',
			extra: { 'queue.name': 'deliver' },
		});

		expect(activeSpan.recordException).toHaveBeenCalledWith(expect.objectContaining({
			message: 'Queue failed',
		}));
		expect(activeSpan.setStatus).toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
			message: 'Queue failed',
		});
		// OTel-only でも調査用の識別子を残せるよう、extra を span 属性へ設定する。
		expect(activeSpan.setAttributes).toHaveBeenCalledWith({ 'queue.name': 'deliver' });
	});

	test('drops non-primitive extra values before they reach span.setAttributes (extra can carry arbitrary shapes like { job, err })', () => {
		const activeSpan = {
			recordException: vi.fn(),
			setStatus: vi.fn(),
			setAttributes: vi.fn(),
		};
		const adapter = new OpenTelemetryAdapter({
			tracer: { startActiveSpan: vi.fn() },
			provider: { shutdown: vi.fn() },
			getActiveSpan: () => activeSpan as unknown as Span,
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 10,
		});

		adapter.captureMessage('Queue: Deliver: Error: boom', {
			level: 'error',
			extra: {
				job: { id: '1', data: { to: 'https://webhook.example/secret' } },
				err: new Error('boom'),
				'queue.name': 'deliver',
			},
		});

		expect(activeSpan.setAttributes).toHaveBeenCalledWith({ 'queue.name': 'deliver' });
	});

	test('captures typed operational events with fixed message and metadata-only attributes', () => {
		const activeSpan = {
			recordException: vi.fn(),
			setStatus: vi.fn(),
			setAttributes: vi.fn(),
		};
		const adapter = new OpenTelemetryAdapter({
			tracer: { startActiveSpan: vi.fn() },
			provider: { shutdown: vi.fn() },
			getActiveSpan: () => activeSpan as unknown as Span,
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 10,
		});

		adapter.captureOperationalEvent(createApiEndpointFailedEvent('/notes/create', new Error('params=DO_NOT_EXPORT'), 'error-1'));

		expect(activeSpan.recordException).toHaveBeenCalledWith(expect.objectContaining({ message: 'API endpoint failed' }));
		expect(activeSpan.setAttributes).toHaveBeenCalledWith({
			'event.name': 'api.endpoint.failed',
			'api.endpoint': '/notes/create',
			'error.id': 'error-1',
			'error.type': 'Error',
		});
		expect(JSON.stringify(activeSpan.recordException.mock.calls)).not.toContain('DO_NOT_EXPORT');
	});

	test('times out shutdown instead of waiting forever', async () => {
		vi.useFakeTimers();
		const adapter = new OpenTelemetryAdapter({
			tracer: { startActiveSpan: vi.fn() },
			provider: { shutdown: vi.fn(() => new Promise<void>(() => {})) },
			getActiveSpan: () => undefined,
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 50,
		});

		const shutdown = adapter.shutdown();
		await vi.advanceTimersByTimeAsync(50);

		await expect(shutdown).resolves.toBeUndefined();
		vi.useRealTimers();
	});

	test('clears the shutdown timeout timer once provider.shutdown() resolves first', async () => {
		vi.useFakeTimers();
		const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
		const adapter = new OpenTelemetryAdapter({
			tracer: { startActiveSpan: vi.fn() },
			provider: { shutdown: vi.fn().mockResolvedValue(undefined) },
			getActiveSpan: () => undefined,
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 5000,
		});

		await adapter.shutdown();

		expect(clearTimeoutSpy).toHaveBeenCalled();
		clearTimeoutSpy.mockRestore();
		vi.useRealTimers();
	});

	test('captureMessage names the standalone report span after the caller message and forwards operational attributes', () => {
		const reportSpan = {
			end: vi.fn(),
			recordException: vi.fn(),
			setStatus: vi.fn(),
			setAttributes: vi.fn(),
		};
		const tracer = {
			startActiveSpan: vi.fn((_name: string, fn: (spanArg: typeof reportSpan) => void) => fn(reportSpan)),
		};
		const adapter = new OpenTelemetryAdapter({
			tracer: tracer as any,
			provider: { shutdown: vi.fn() },
			getActiveSpan: () => undefined,
			spanStatusCodeError: SpanStatusCode.ERROR,
			shutdownTimeout: 10,
		});

		// 報告専用 span を呼び出し元ごとに識別できるよう、message を名前に使うことを確認する。
		adapter.captureMessage('Queue job failed', {
			level: 'error',
			extra: { 'queue.name': 'deliver', 'error.type': 'Error' },
		});

		expect(tracer.startActiveSpan).toHaveBeenCalledWith('Queue job failed', expect.any(Function));
		expect(reportSpan.recordException).toHaveBeenCalledWith(expect.objectContaining({
			message: 'Queue job failed',
		}));
		expect(reportSpan.setStatus).toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
			message: 'Queue job failed',
		});
		expect(reportSpan.setAttributes).toHaveBeenCalledWith({ 'queue.name': 'deliver', 'error.type': 'Error' });
		expect(reportSpan.end).toHaveBeenCalledTimes(1);
	});
});

describe('createSampler', () => {
	test('accepts sample rates within [0, 1]', () => {
		expect(() => createSampler(0, samplerDeps)).not.toThrow();
		expect(() => createSampler(0.5, samplerDeps)).not.toThrow();
		expect(() => createSampler(1, samplerDeps)).not.toThrow();
	});

	test('rejects sample rates outside [0, 1]', () => {
		expect(() => createSampler(-0.1, samplerDeps)).toThrow();
		expect(() => createSampler(1.1, samplerDeps)).toThrow();
	});

	test('rejects NaN instead of silently disabling sampling', () => {
		expect(() => createSampler(Number.NaN, samplerDeps)).toThrow();
	});

	test('rejects Infinity instead of allowing an invalid ratio to reach the SDK', () => {
		expect(() => createSampler(Number.POSITIVE_INFINITY, samplerDeps)).toThrow();
		expect(() => createSampler(Number.NEGATIVE_INFINITY, samplerDeps)).toThrow();
	});

	test('rejects non-number values that pass through YAML as strings', () => {
		expect(() => createSampler('0.5' as unknown as number, samplerDeps)).toThrow();
	});

	test('uses the standard ParentBased remote-parent policy while applying the local ratio to roots', () => {
		const sampler = createSampler(0, samplerDeps);
		const remoteSampled = trace.setSpanContext(ROOT_CONTEXT, {
			traceId: '0123456789abcdef0123456789abcdef', spanId: '0123456789abcdef', traceFlags: 1, isRemote: true,
		});
		const remoteUnsampled = trace.setSpanContext(ROOT_CONTEXT, {
			traceId: '0123456789abcdef0123456789abcdef', spanId: '0123456789abcdef', traceFlags: 0, isRemote: true,
		});

		// 標準の ParentBasedSampler は remote sampled parent を継続し、未sampled parent は抑制する。
		expect(sampler.shouldSample(remoteSampled, 'fedcba9876543210fedcba9876543210', 'test', SpanKind.INTERNAL, {}, []).decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
		expect(sampler.shouldSample(remoteUnsampled, 'fedcba9876543210fedcba9876543210', 'test', SpanKind.INTERNAL, {}, []).decision).toBe(SamplingDecision.NOT_RECORD);
	});
});

describe('OTel sampler environment precedence', () => {
	test('resolves YAML sampleRate before the SDK sampler environment and Misskey default', () => {
		expect(defaultTraceSampleRate).toBe(0.01);
		expect(resolveTraceSampler(0.25, { OTEL_TRACES_SAMPLER: 'always_off' })).toEqual({ source: 'config', sampleRate: 0.25 });
		expect(resolveTraceSampler(undefined, { OTEL_TRACES_SAMPLER: 'always_off' })).toEqual({ source: 'environment' });
		expect(resolveTraceSampler(undefined, {})).toEqual({ source: 'default', sampleRate: 0.01 });
		expect(hasOtelSamplerEnvironment({})).toBe(false);
		expect(hasOtelSamplerEnvironment({ OTEL_TRACES_SAMPLER: '' })).toBe(false);
		expect(hasOtelSamplerEnvironment({ OTEL_TRACES_SAMPLER: 'parentbased_traceidratio' })).toBe(true);
	});
});

describe('createResource', () => {
	test('lets explicit config override OTEL resource env, and env override Misskey defaults', () => {
		const previousServiceName = process.env['OTEL_SERVICE_NAME'];
		const previousResourceAttributes = process.env['OTEL_RESOURCE_ATTRIBUTES'];
		process.env['OTEL_SERVICE_NAME'] = 'env-service';
		process.env['OTEL_RESOURCE_ATTRIBUTES'] = [
			'deployment.environment=staging',
			'misskey.process.role=env-role',
			'service.instance.id=env-instance',
			'env.only=value',
		].join(',');

		try {
			const resource = createResource({
				serviceVersion: '2026.1.0',
				resourceAttributes: {
					[ATTR_SERVICE_NAME]: 'config-service',
					'deployment.environment': 'production',
					'config.only': 'value',
				},
			}, {
				defaultResource,
				resourceFromAttributes,
				detectResources,
				envDetector,
				serviceNameAttribute: ATTR_SERVICE_NAME,
				serviceInstanceIdAttribute: ATTR_SERVICE_INSTANCE_ID,
				serviceVersionAttribute: ATTR_SERVICE_VERSION,
				serviceVersion: '2026.1.0',
			});

			expect(resource.attributes[ATTR_SERVICE_NAME]).toBe('config-service');
			expect(resource.attributes[ATTR_SERVICE_INSTANCE_ID]).toBe('env-instance');
			expect(resource.attributes[ATTR_SERVICE_VERSION]).toBe('2026.1.0');
			expect(resource.attributes['deployment.environment']).toBe('production');
			expect(resource.attributes['misskey.process.role']).toBe('env-role');
			expect(resource.attributes['env.only']).toBe('value');
			expect(resource.attributes['config.only']).toBe('value');
		} finally {
			if (previousServiceName == null) {
				delete process.env['OTEL_SERVICE_NAME'];
			} else {
				process.env['OTEL_SERVICE_NAME'] = previousServiceName;
			}
			if (previousResourceAttributes == null) {
				delete process.env['OTEL_RESOURCE_ATTRIBUTES'];
			} else {
				process.env['OTEL_RESOURCE_ATTRIBUTES'] = previousResourceAttributes;
			}
		}
	});
});

describe('getMisskeyProcessRole', () => {
	beforeEach(() => {
		mocks.envOption.disableClustering = false;
		mocks.envOption.onlyServer = false;
		mocks.envOption.onlyQueue = false;
		mocks.isPrimary = false;
	});

	test('labels non-clustered onlyServer as primary-server', () => {
		mocks.envOption.disableClustering = true;
		mocks.envOption.onlyServer = true;
		expect(getMisskeyProcessRole()).toBe('primary-server');
	});

	test('labels clustered primary with onlyServer as fork-only', () => {
		mocks.isPrimary = true;
		mocks.envOption.onlyServer = true;
		expect(getMisskeyProcessRole()).toBe('fork-only');
	});

	test('labels clustered worker running the HTTP server (onlyServer) as worker-server, not worker-queue', () => {
		mocks.isPrimary = false;
		mocks.envOption.onlyServer = true;
		expect(getMisskeyProcessRole()).toBe('worker-server');
	});

	test('labels clustered worker without onlyServer as worker-queue', () => {
		mocks.isPrimary = false;
		mocks.envOption.onlyServer = false;
		expect(getMisskeyProcessRole()).toBe('worker-queue');
	});
});
