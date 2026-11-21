/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { IdService } from '@/core/IdService.js';

@Injectable()
export class UserService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,
		private systemWebhookService: SystemWebhookService,
		private userEntityService: UserEntityService,
		private fanoutTimelineService: FanoutTimelineService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async updateLastActiveDate(user: MiUser): Promise<void> {
		if (user.isHibernated) {
			const result = await this.usersRepository.createQueryBuilder().update()
				.set({
					lastActiveDate: new Date(),
				})
				.where('id = :id', { id: user.id })
				.returning('*')
				.execute()
				.then((response) => {
					return response.raw[0];
				});
			const wokeUp = result.isHibernated;
			if (wokeUp) {
				this.usersRepository.update(user.id, {
					isHibernated: false,
				});
				this.followingsRepository.update({
					followerId: user.id,
				}, {
					isFollowerHibernated: false,
				});
				// 休眠中は HTL へのファンアウトが止まっていたので、復帰時点より古い範囲は DB と合わせて返すよう水位を引き上げる。
				// 呼び出し元は待たないので、Redis のエラーで unhandled rejection にならないよう握りつぶす
				const now = this.idService.gen();
				this.fanoutTimelineService.raiseWatermark(`homeTimeline:${user.id}`, now).catch(() => {});
				this.fanoutTimelineService.raiseWatermark(`homeTimelineWithFiles:${user.id}`, now).catch(() => {});
			}
		} else {
			this.usersRepository.update(user.id, {
				lastActiveDate: new Date(),
			});
		}
	}

	/**
	 * SystemWebhookを用いてユーザに関する操作内容を管理者各位に通知する.
	 * ここではJobQueueへのエンキューのみを行うため、即時実行されない.
	 *
	 * @see SystemWebhookService.enqueueSystemWebhook
	 */
	@bindThis
	public async notifySystemWebhook(user: MiUser, type: 'userCreated') {
		const packedUser = await this.userEntityService.pack(user, null, { schema: 'UserLite' });
		return this.systemWebhookService.enqueueSystemWebhook(type, packedUser);
	}
}
