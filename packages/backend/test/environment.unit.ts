/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// tsyringe は reflect-metadata polyfill を必要とする。各 vitest worker は test environment を
// load して各 test ファイルを isolate する仕組みなので、environment 側で polyfill を提供する。
import 'reflect-metadata';
import { init } from 'slacc';
import { builtinEnvironments } from 'vitest/runtime';

init(1);

export default builtinEnvironments.node;
