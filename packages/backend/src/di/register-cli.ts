/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';
import { CommandService } from '@/cli/CommandService.js';

// 旧 CommandModule.
export function registerCliServices(c: DependencyContainer): void {
	c.registerSingleton(CommandService);
}
