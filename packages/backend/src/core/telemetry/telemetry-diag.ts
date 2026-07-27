/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Logger from '@/logger.js';
import type { DiagAPI, DiagLogger, DiagLogLevel } from '@opentelemetry/api';

export function registerDiagLogger(
	diagApi: DiagAPI,
	diagLogLevelWarn: DiagLogLevel,
): void {
	// diagはプロセスグローバルなので、通常運用で必要なWARN以上だけをMisskeyのログに流す。
	const logger = new Logger('otel', 'green');
	const diagLogger: DiagLogger = {
		error: (message, ...args) => writeDiag(logger, 'error', message, args),
		warn: (message, ...args) => writeDiag(logger, 'warn', message, args),
		info: (message, ...args) => writeDiag(logger, 'info', message, args),
		debug: (message, ...args) => writeDiag(logger, 'debug', message, args),
		verbose: (message, ...args) => writeDiag(logger, 'debug', message, args),
	};

	diagApi.setLogger(diagLogger, {
		logLevel: diagLogLevelWarn,
		suppressOverrideMessage: true,
	});
}

function writeDiag(logger: Logger, level: 'debug' | 'info' | 'warn' | 'error', message: string, args: unknown[]): void {
	const errors = args.filter(isError);
	const values = args.filter(arg => !isError(arg));
	// OTel diagnostics are a best-effort observability path and must never break
	// SDK initialization or the request that surfaced the diagnostic.
	try {
		logger.write({
			level,
			message,
			eventName: 'otel.diag',
			...(values.length > 0 ? { attributes: { 'otel.diag.arguments': values } } : {}),
			...(errors[0] != null ? { error: errors[0] } : {}),
		});
	} catch {
		// Keep the diagnostic boundary non-throwing even if the application logger fails.
	}
}

function isError(value: unknown): value is Error {
	try {
		return value instanceof Error;
	} catch {
		return false;
	}
}
