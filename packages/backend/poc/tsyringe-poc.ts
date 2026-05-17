/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { container, inject, injectable, delay } from 'tsyringe';
import { RootService } from './services/RootService.js';
import { CircularPartner } from './services/CircularPartner.js';
import { LeafService } from './services/LeafService.js';
import { MiddleService } from './services/MiddleService.js';
import { ConfigToken } from './services/tokens.js';

interface Config {
	name: string;
}

const child = container.createChildContainer();
child.register<Config>(ConfigToken, { useValue: { name: 'PoC' } });
child.registerSingleton(LeafService);
child.registerSingleton(MiddleService);
child.registerSingleton(RootService);
child.registerSingleton(CircularPartner);

const root = child.resolve(RootService);
console.log('[PoC]', root.run());
console.log('[PoC] root is singleton:', root === child.resolve(RootService));
console.log('[PoC] circular partner.root === root:', root.partner.root === root);

const child2 = container.createChildContainer();
child2.register<Config>(ConfigToken, { useValue: { name: 'second-context' } });
child2.registerSingleton(LeafService);
child2.registerSingleton(MiddleService);
child2.registerSingleton(RootService);
child2.registerSingleton(CircularPartner);

const root2 = child2.resolve(RootService);
console.log('[PoC] second container leaf differs:', root.middle.leaf !== root2.middle.leaf);
console.log('[PoC] second container greet:', root2.middle.leaf.greet());
