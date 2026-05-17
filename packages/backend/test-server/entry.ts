/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// tsyringe デコレータを含む src/ のモジュールを import する前に polyfill を読む。
import 'reflect-metadata';

import { portToPid } from 'pid-port';
import fkill from 'fkill';
import Fastify from 'fastify';
import type { DependencyContainer } from 'tsyringe';
import { composeServerContainer } from '@/di/compose.js';
import { ServerService } from '@/server/ServerService.js';
import { loadConfig } from '@/config.js';
import { DisposableRegistry } from '@/di/disposable-registry.js';
import { disposeGlobalResources } from '@/di/register-globals.js';
import { disposeQueueClients } from '@/di/register-queue.js';

const config = loadConfig();
const originEnv = JSON.stringify(process.env);

process.env.NODE_ENV = 'test';

let container: DependencyContainer;
let serverService: ServerService;

/**
 * テスト用のサーバインスタンスを起動する
 */
export async function setup() {
	await killTestServer();

	console.log('starting application...');

	container = await composeServerContainer();
	serverService = container.resolve(ServerService);
	await serverService.launch();

	await startControllerEndpoints();

	// ジョブキューは必要な時にテストコード側で起動する
	// ジョブキューが動くとテスト結果の確認に支障が出ることがあるので意図的に動かさないでいる

	console.log('application initialized.');
}

/**
 * テスト用のサーバインスタンスを停止する
 */
export async function teardown() {
	await disposeContainer();
	await disposeGlobalsSafe();
	await killTestServer();
}

/**
 * container と global リソースを破棄する。複数箇所から呼べるよう副作用を捕捉する。
 */
async function disposeContainer() {
	try {
		await container.resolve(DisposableRegistry).disposeAll();
	} catch (e) {
		console.error('[test-server] disposeAll failed', e);
	}
}

async function disposeGlobalsSafe() {
	try {
		await disposeQueueClients();
	} catch (e) {
		console.error('[test-server] disposeQueueClients failed', e);
	}
	try {
		await disposeGlobalResources();
	} catch (e) {
		console.error('[test-server] disposeGlobalResources failed', e);
	}
}

/**
 * 既に重複したポートで待ち受けしているサーバがある場合はkillする
 */
async function killTestServer() {
	//
	try {
		const pid = await portToPid(config.port);
		if (pid) {
			await fkill(pid, { force: true });
		}
	} catch {
		// NOP;
	}
}

/**
 * 別プロセスに切り離してしまったが故に出来なくなった環境変数の書き換え等を実現するためのエンドポイントを作る
 * @param port
 */
async function startControllerEndpoints(port = config.port + 1000) {
	const fastify = Fastify();

	fastify.post<{ Body: { key?: string, value?: string } }>('/env', async (req, res) => {
		console.log(req.body);
		const key = req.body['key'];
		if (!key) {
			res.code(400).send({ success: false });
			return;
		}

		process.env[key] = req.body['value'];

		res.code(200).send({ success: true });
	});

	fastify.post<{ Body: { key?: string, value?: string } }>('/env-reset', async (req, res) => {
		process.env = JSON.parse(originEnv);

		await disposeContainer();
		await disposeGlobalsSafe();

		await killTestServer();

		console.log('starting application...');

		container = await composeServerContainer();
		serverService = container.resolve(ServerService);
		await serverService.launch();

		res.code(200).send({ success: true });
	});

	await fastify.listen({ port: port, host: 'localhost' });
}
