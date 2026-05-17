/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { composeCliContainer } from '@/di/compose.js';
import { DisposableRegistry } from '@/di/disposable-registry.js';
import { disposeGlobalResources } from '@/di/register-globals.js';
import { disposeQueueClients } from '@/di/register-queue.js';
import { CommandService } from '@/cli/CommandService.js';

process.title = 'Misskey Cli';

Error.stackTraceLimit = Infinity;
EventEmitter.defaultMaxListeners = 128;

const container = await composeCliContainer();

const commandService = container.resolve(CommandService);

const command = process.argv[2] ?? 'help';

let exitCode = 0;
try {
	switch (command) {
		case 'help': {
			console.log('Available commands:');
			console.log('  help - Displays this help message');
			console.log('  reset-captcha - Resets the captcha');
			break;
		}
		case 'ping': {
			await commandService.ping();
			break;
		}
		case 'reset-captcha': {
			await commandService.resetCaptcha();
			console.log('Captcha has been reset.');
			break;
		}
		default: {
			console.error(`Unrecognized command: ${command}`);
			console.error('Use "help" to see available commands.');
			exitCode = 1;
		}
	}
} finally {
	await container.resolve(DisposableRegistry).disposeAll();
	await disposeQueueClients();
	await disposeGlobalResources();
}

process.exit(exitCode);
