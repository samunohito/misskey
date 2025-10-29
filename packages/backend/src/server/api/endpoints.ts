/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IEndpoint } from '@/server/api/endpoint-types.js';
import * as endpointsObject from './endpoint-list.js';

const endpoints: IEndpoint[] = Object.entries(endpointsObject).map(([name, ep]) => {
	return {
		name: name,
		get meta() {
			return ep.meta ?? {};
		},
		get params() {
			return ep.paramDef;
		},
	};
});

// eslint-disable-next-line import/no-default-export
export default endpoints;
