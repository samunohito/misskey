/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { TelemetryService } from '@/core/telemetry/TelemetryService.js';

type QueueTelemetryService = Pick<TelemetryService, 'startSpanWithTraceContext'>;

type QueueJobExecution<T> =
	| { readonly outcome: 'success'; readonly value: T }
	| { readonly outcome: 'failure'; readonly error: unknown };

/** QueueのprocessorをTrace Context付きで実行し、失敗処理をSpan内で行います。 */
export async function runQueueJobWithTraceContext<T>(
	telemetryService: QueueTelemetryService,
	spanName: string,
	jobData: object,
	processJob: () => T | Promise<T>,
	onError: (error: Error) => void,
): Promise<T> {
	const execution = await telemetryService.startSpanWithTraceContext(spanName, jobData, async (): Promise<QueueJobExecution<T>> => {
		try {
			return { outcome: 'success', value: await processJob() };
		} catch (error) {
			// 失敗イベントを待たず、processor Spanがactiveな間にログと通知を行う。
			const normalizedError = error instanceof Error ? error : new Error(String(error));
			try {
				onError(normalizedError);
			} catch {
				// 失敗ログの処理が例外を投げても、Queueへは元のエラーを返します。
			}
			// 元のErrorはSpan callbackの外で再throwし、executeSpanが例外本文やstackを記録しないようにする。
			return { outcome: 'failure', error };
		}
	});
	if (execution.outcome === 'failure') throw execution.error;
	return execution.value;
}
