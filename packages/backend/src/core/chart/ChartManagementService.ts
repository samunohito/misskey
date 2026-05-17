/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { Disposable, DisposableRegistry } from '@/di/disposable-registry.js';
import { bindThis } from '@/decorators.js';
import FederationChart from './charts/federation.js';
import NotesChart from './charts/notes.js';
import UsersChart from './charts/users.js';
import ActiveUsersChart from './charts/active-users.js';
import InstanceChart from './charts/instance.js';
import PerUserNotesChart from './charts/per-user-notes.js';
import PerUserPvChart from './charts/per-user-pv.js';
import DriveChart from './charts/drive.js';
import PerUserReactionsChart from './charts/per-user-reactions.js';
import PerUserFollowingChart from './charts/per-user-following.js';
import PerUserDriveChart from './charts/per-user-drive.js';
import ApRequestChart from './charts/ap-request.js';
@injectable()
export class ChartManagementService implements Disposable {
	private charts;
	private saveIntervalId: NodeJS.Timeout;

	constructor(
		@inject(delay(() => FederationChart))
		private federationChart: FederationChart,

		@inject(delay(() => NotesChart))
		private notesChart: NotesChart,

		@inject(delay(() => UsersChart))
		private usersChart: UsersChart,

		@inject(delay(() => ActiveUsersChart))
		private activeUsersChart: ActiveUsersChart,

		@inject(delay(() => InstanceChart))
		private instanceChart: InstanceChart,

		@inject(delay(() => PerUserNotesChart))
		private perUserNotesChart: PerUserNotesChart,

		@inject(delay(() => PerUserPvChart))
		private perUserPvChart: PerUserPvChart,

		@inject(delay(() => DriveChart))
		private driveChart: DriveChart,

		@inject(delay(() => PerUserReactionsChart))
		private perUserReactionsChart: PerUserReactionsChart,

		@inject(delay(() => PerUserFollowingChart))
		private perUserFollowingChart: PerUserFollowingChart,

		@inject(delay(() => PerUserDriveChart))
		private perUserDriveChart: PerUserDriveChart,

		@inject(delay(() => ApRequestChart))
		private apRequestChart: ApRequestChart,

		@inject(delay(() => DisposableRegistry))
		registry: DisposableRegistry,
	) {
		registry.register(this);
		this.charts = [
			this.federationChart,
			this.notesChart,
			this.usersChart,
			this.activeUsersChart,
			this.instanceChart,
			this.perUserNotesChart,
			this.perUserPvChart,
			this.driveChart,
			this.perUserReactionsChart,
			this.perUserFollowingChart,
			this.perUserDriveChart,
			this.apRequestChart,
		];
	}

	@bindThis
	public async start() {
		// 20分おきにメモリ情報をDBに書き込み
		this.saveIntervalId = setInterval(async () => {
			for (const chart of this.charts) {
				await chart.save();
			}
		}, 1000 * 60 * 20);
	}

	@bindThis
	public async dispose(): Promise<void> {
		clearInterval(this.saveIntervalId);
		if (process.env.NODE_ENV !== 'test') {
			for (const chart of this.charts) {
				await chart.save();
			}
		}
	}
}
