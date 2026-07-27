/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { AiService as AiServiceType, Prediction } from '@/core/AiService.js';
import type { MiMeta } from '@/models/_.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { LoggerService } from '@/core/LoggerService.js';

// AiService が直接 import している node-fetch をモックして、外部サービスへの送信内容と
// レスポンス解釈を検証する。
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('node-fetch', () => ({ default: fetchMock }));

const { AiService } = await import('@/core/AiService.js');

let getAgentByUrlMock: ReturnType<typeof vi.fn>;
let loggerWriteMock: ReturnType<typeof vi.fn>;

const DEFAULT_META = {
	sensitiveMediaDetectionApiUrl: 'http://localhost:3009' as string | null,
	sensitiveMediaDetectionApiKey: null as string | null,
	sensitiveMediaDetectionTimeout: 5000,
	sensitiveMediaDetectionMaxImagesPerRequest: 4,
};

function makeService(metaOverrides: Partial<typeof DEFAULT_META> = {}): AiServiceType {
	const meta = { ...DEFAULT_META, ...metaOverrides } as unknown as MiMeta;
	getAgentByUrlMock = vi.fn(() => undefined);
	loggerWriteMock = vi.fn();
	const httpRequestService = { getAgentByUrl: getAgentByUrlMock } as unknown as HttpRequestService;
	const loggerService = {
		getLogger: () => ({ warn: () => {}, error: () => {}, info: () => {}, write: loggerWriteMock }),
	} as unknown as LoggerService;
	return new AiService(meta, httpRequestService, loggerService);
}

function neutral(): Prediction[] {
	return [{ className: 'Neutral', probability: 0.99 }];
}

function okResponse(results: unknown[], options: { contentType?: string; body?: unknown } = {}) {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		headers: { get: () => options.contentType ?? 'application/json' },
		body: options.body ?? null,
		json: async () => ({ success: true, result: { results } }),
	};
}

const buf = (s: string) => Buffer.from(s);

describe('AiService', () => {
	beforeEach(() => {
		fetchMock.mockReset();
	});

	test('正常: 送信順を保った予測値配列を返す', async () => {
		fetchMock.mockResolvedValue(okResponse([
			{ success: true, predictions: neutral() },
			{ success: true, predictions: [{ className: 'Porn', probability: 0.8 }] },
		]));
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res).toEqual([
			[{ className: 'Neutral', probability: 0.99 }],
			[{ className: 'Porn', probability: 0.8 }],
		]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3009/v1/detect-images');
		expect((fetchMock.mock.calls[0][1] as { size: number }).size).toBe(64 * 1024);
	});

	test('外部サービス: 通常の outbound agent を使用する', async () => {
		fetchMock.mockResolvedValue(okResponse([{ success: true, predictions: neutral() }]));
		const svc = makeService({ sensitiveMediaDetectionApiUrl: 'https://detector.example.com' });

		await svc.detectSensitiveMany([buf('a')]);

		const requestOptions = fetchMock.mock.calls[0][1] as { agent: (url: URL) => unknown };
		requestOptions.agent(new URL('https://detector.example.com/v1/detect-images'));
		expect(getAgentByUrlMock).toHaveBeenCalledWith(expect.any(URL));
	});

	test('detectSensitive: 単一画像はバッチの先頭を返す', async () => {
		fetchMock.mockResolvedValue(okResponse([{ success: true, predictions: neutral() }]));
		const svc = makeService();
		const res = await svc.detectSensitive(buf('a'));
		expect(res).toEqual(neutral());
	});

	test('部分失敗: 失敗パーツのみ null になる', async () => {
		fetchMock.mockResolvedValue(okResponse([
			{ success: true, predictions: neutral() },
			{ success: false, error: { code: 'IMAGE_DECODE_FAILED', message: 'x' } },
		]));
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res[0]).toEqual(neutral());
		expect(res[1]).toBeNull();
	});

	test('非200: チャンク全件 null（例外を投げない）', async () => {
		const destroy = vi.fn();
		fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable', headers: { get: () => 'application/json' }, body: { destroy }, json: async () => ({}) });
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res).toEqual([null, null]);
		expect(destroy).toHaveBeenCalledOnce();
		expect(JSON.stringify(loggerWriteMock.mock.calls)).not.toContain('Service Unavailable');
	});

	test('不正なContent-Type: bodyを破棄してnullへfallbackする', async () => {
		const destroy = vi.fn();
		fetchMock.mockResolvedValue(okResponse([], { contentType: 'text/plain', body: { destroy } }));
		const svc = makeService();

		expect(await svc.detectSensitiveMany([buf('a')])).toEqual([null]);
		expect(destroy).toHaveBeenCalledOnce();
	});

	test('予測確率のNaN・範囲外と結果件数不一致を拒否する', async () => {
		fetchMock.mockResolvedValueOnce(okResponse([{ success: true, predictions: [{ className: 'nan', probability: Number.NaN }] }]));
		const svc = makeService();
		expect(await svc.detectSensitiveMany([buf('a')])).toEqual([null]);

		fetchMock.mockResolvedValueOnce(okResponse([{ success: true, predictions: [{ className: 'out-of-range', probability: 1.1 }] }]));
		expect(await svc.detectSensitiveMany([buf('a')])).toEqual([null]);

		fetchMock.mockResolvedValueOnce(okResponse([]));
		expect(await svc.detectSensitiveMany([buf('a')])).toEqual([null]);
	});

	test('通信エラー: チャンク全件 null（例外を投げない）', async () => {
		fetchMock.mockRejectedValue(new Error('network down'));
		const svc = makeService();
		const res = await svc.detectSensitiveMany([buf('a')]);
		expect(res).toEqual([null]);
	});

	test('接続先未設定: HTTP を叩かず全件 null', async () => {
		const svc = makeService({ sensitiveMediaDetectionApiUrl: null });
		const res = await svc.detectSensitiveMany([buf('a'), buf('b')]);
		expect(res).toEqual([null, null]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('チャンク分割: maxImagesPerRequest ごとに順次送信する', async () => {
		fetchMock
			.mockResolvedValueOnce(okResponse([
				{ success: true, predictions: neutral() },
				{ success: true, predictions: neutral() },
			]))
			.mockResolvedValueOnce(okResponse([
				{ success: true, predictions: neutral() },
				{ success: true, predictions: neutral() },
			]))
			.mockResolvedValueOnce(okResponse([
				{ success: true, predictions: neutral() },
			]));
		const svc = makeService({ sensitiveMediaDetectionMaxImagesPerRequest: 2 });
		const res = await svc.detectSensitiveMany([buf('a'), buf('b'), buf('c'), buf('d'), buf('e')]);
		// 5 枚を 2 枚ずつ → 3 リクエスト、結果は順序を保って 5 件。
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(res).toHaveLength(5);
		expect(res.every(x => x != null)).toBe(true);
	});

	test('APIキー設定時のみ Authorization: Bearer を付与する', async () => {
		fetchMock.mockResolvedValue(okResponse([{ success: true, predictions: neutral() }]));

		const withKey = makeService({ sensitiveMediaDetectionApiKey: 'secret' });
		await withKey.detectSensitiveMany([buf('a')]);
		expect((fetchMock.mock.calls[0][1] as { headers: { Authorization?: string } }).headers.Authorization).toBe('Bearer secret');

		fetchMock.mockClear();
		fetchMock.mockResolvedValue(okResponse([{ success: true, predictions: neutral() }]));
		const withoutKey = makeService();
		await withoutKey.detectSensitiveMany([buf('a')]);
		expect((fetchMock.mock.calls[0][1] as { headers: { Authorization?: string } }).headers.Authorization).toBeUndefined();
	});
});
