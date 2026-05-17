/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { delay, inject, injectable } from 'tsyringe';
import { createTestContainer } from './testing.js';
import type { Disposable } from './disposable-registry.js';
import { DisposableRegistry } from './disposable-registry.js';
import { DependencyContainerToken } from './container.js';

describe('di', () => {
	it('resolves a basic injectable service', async () => {
		@injectable()
		class GreeterService {
			greet(): string {
				return 'hello';
			}
		}

		const c = await createTestContainer({
			register: (c) => c.registerSingleton(GreeterService),
		});

		const svc = c.resolve(GreeterService);
		expect(svc.greet()).toBe('hello');
		expect(c.resolve(GreeterService)).toBe(svc); // singleton
	});

	it('resolves transitive dependencies', async () => {
		@injectable()
		class LeafService {
			id = 'leaf';
		}

		@injectable()
		class RootService {
			constructor(@inject(delay(() => LeafService)) public leaf: LeafService) {}
		}

		const c = await createTestContainer({
			register: (c) => {
				c.registerSingleton(LeafService);
				c.registerSingleton(RootService);
			},
		});

		const root = c.resolve(RootService);
		expect(root.leaf.id).toBe('leaf');
	});

	it('isolates singletons between sibling containers', async () => {
		@injectable()
		class CounterService {
			count = 0;
			inc() { this.count++; }
		}

		const c1 = await createTestContainer({
			register: (c) => c.registerSingleton(CounterService),
		});
		const c2 = await createTestContainer({
			register: (c) => c.registerSingleton(CounterService),
		});

		const s1 = c1.resolve(CounterService);
		const s2 = c2.resolve(CounterService);
		s1.inc();
		s1.inc();
		s2.inc();
		expect(s1.count).toBe(2);
		expect(s2.count).toBe(1);
		expect(s1).not.toBe(s2);
	});

	it('provides DependencyContainerToken for self-injection', async () => {
		const c = await createTestContainer();
		const self = c.resolve<typeof c>(DependencyContainerToken);
		expect(self).toBe(c);
	});

	it('disposes registered services via DisposableRegistry (LIFO)', async () => {
		const order: string[] = [];

		@injectable()
		class A implements Disposable {
			constructor(@inject(DisposableRegistry) registry: DisposableRegistry) { registry.register(this); }
			dispose(): void { order.push('A'); }
		}

		@injectable()
		class B implements Disposable {
			constructor(@inject(DisposableRegistry) registry: DisposableRegistry, @inject(A) public a: A) { registry.register(this); }
			dispose(): void { order.push('B'); }
		}

		const c = await createTestContainer({
			register: (c) => {
				c.registerSingleton(A);
				c.registerSingleton(B);
			},
		});

		c.resolve(B);
		await c.resolve(DisposableRegistry).disposeAll('SIGTEST');
		expect(order).toEqual(['B', 'A']); // LIFO
	});

	it('continues disposing on failure', async () => {
		const order: string[] = [];

		@injectable()
		class Bomb implements Disposable {
			constructor(@inject(DisposableRegistry) registry: DisposableRegistry) { registry.register(this); }
			dispose(): void { order.push('bomb'); throw new Error('boom'); }
		}

		@injectable()
		class Survivor implements Disposable {
			constructor(@inject(DisposableRegistry) registry: DisposableRegistry, @inject(Bomb) public b: Bomb) { registry.register(this); }
			dispose(): void { order.push('survivor'); }
		}

		const c = await createTestContainer({
			register: (c) => {
				c.registerSingleton(Bomb);
				c.registerSingleton(Survivor);
			},
		});
		c.resolve(Survivor);

		await expect(c.resolve(DisposableRegistry).disposeAll()).resolves.toBeUndefined();
		expect(order).toEqual(['survivor', 'bomb']);
	});

	it('prevents register after disposeAll', async () => {
		const c = await createTestContainer();
		const reg = c.resolve(DisposableRegistry);
		await reg.disposeAll();
		expect(() => reg.register({ dispose: () => {} })).toThrow();
	});
});
