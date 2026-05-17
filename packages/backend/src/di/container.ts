/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';

// 現在の context container を service に注入するための token。
// 旧 NestJS の `ModuleRef` の代替。`ApiServerService` の endpoint 動的解決や
// `StreamingApiServerService` の child container 生成などで使う。
export const DependencyContainerToken: unique symbol = Symbol('DependencyContainer');

export type { DependencyContainer };
