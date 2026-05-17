/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DependencyContainer } from 'tsyringe';

import { ChartLoggerService } from '@/core/chart/ChartLoggerService.js';
import FederationChart from '@/core/chart/charts/federation.js';
import NotesChart from '@/core/chart/charts/notes.js';
import UsersChart from '@/core/chart/charts/users.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import PerUserNotesChart from '@/core/chart/charts/per-user-notes.js';
import PerUserPvChart from '@/core/chart/charts/per-user-pv.js';
import DriveChart from '@/core/chart/charts/drive.js';
import PerUserReactionsChart from '@/core/chart/charts/per-user-reactions.js';
import PerUserFollowingChart from '@/core/chart/charts/per-user-following.js';
import PerUserDriveChart from '@/core/chart/charts/per-user-drive.js';
import ApRequestChart from '@/core/chart/charts/ap-request.js';
import { ChartManagementService } from '@/core/chart/ChartManagementService.js';

export function registerChartServices(c: DependencyContainer): void {
	const classes: Array<new (...args: never[]) => unknown> = [
		ChartLoggerService,
		FederationChart,
		NotesChart,
		UsersChart,
		ActiveUsersChart,
		InstanceChart,
		PerUserNotesChart,
		PerUserPvChart,
		DriveChart,
		PerUserReactionsChart,
		PerUserFollowingChart,
		PerUserDriveChart,
		ApRequestChart,
		ChartManagementService,
	];

	for (const cls of classes) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		c.registerSingleton(cls as any);
	}
}
