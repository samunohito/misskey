/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { injectable } from 'tsyringe';

export interface Disposable {
	dispose(signal?: string): void | Promise<void>;
}

// `OnApplicationShutdown` 相当。サービスは constructor で `registry.register(this)` を呼び、
// アプリ終了時に `disposeAll(signal)` を呼ぶ。
//
// `@singleton()` ではなく `@injectable()` のみ付ける。context container 側で
// 明示的に `registerSingleton(DisposableRegistry)` を呼ぶことで、
// server / jobQueue / cli 各 context が独立したインスタンスを持つ。
@injectable()
export class DisposableRegistry {
	private readonly items: Disposable[] = [];
	private disposed = false;

	register(d: Disposable): void {
		if (this.disposed) {
			throw new Error('DisposableRegistry: already disposed, cannot register');
		}
		this.items.push(d);
	}

	async disposeAll(signal?: string): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		// LIFO で逆順実行（後から登録されたものから落とす）
		for (const d of [...this.items].reverse()) {
			try {
				await d.dispose(signal);
			} catch (e) {
				console.error('[DisposableRegistry] dispose failed', e);
			}
		}
	}
}
