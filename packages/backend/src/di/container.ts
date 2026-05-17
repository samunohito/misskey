/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';

// 現在の context container を service に注入するための token。
// 旧 NestJS の `ModuleRef` の代替。`ApiServerService` の endpoint 動的解決や
// `StreamingApiServerService` の child container 生成などで使う。
export const DependencyContainerToken: unique symbol = Symbol('DependencyContainer');

// WebSocket request scope の payload を child container 経由で注入するための token。
// 旧 NestJS の `REQUEST` (`@nestjs/core`) の代替。
// 用途:
//   - Connection 単位の child container には `ConnectionRequest` (user/token) を入れる
//   - Channel 単位の sub-child container には `ChannelRequest` (id/connection) を入れる
export const RequestToken: unique symbol = Symbol('Request');

export type { DependencyContainer };
