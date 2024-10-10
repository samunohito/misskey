/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import { RoleService } from '@/core/RoleService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

// モデレーターが不在と判断する日付の閾値
const MODERATOR_INACTIVITY_LIMIT_DAYS = 7;
const ONE_DAY_MILLI_SEC = 1000 * 60 * 60 * 24;

@Injectable()
export class CheckModeratorsActivityProcessorService {
	private logger: Logger;

	constructor(
		private metaService: MetaService,
		private roleService: RoleService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('check-moderators-activity');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('start.');

		const meta = await this.metaService.fetch(false);
		if (!meta.disableRegistration) {
			await this.processImpl();
		} else {
			this.logger.warn('is already invitation only.');
		}

		this.logger.succ('finish.');
	}

	@bindThis
	private async processImpl() {
		const { isModeratorsInactive, inactivityLimitCountdown } = await this.evaluateModeratorsInactiveDays();
		if (isModeratorsInactive) {
			this.logger.warn(`The moderator has been inactive for ${MODERATOR_INACTIVITY_LIMIT_DAYS} days. We will move to invitation only.`);
			await this.changeToInvitationOnly();
		} else {
			if (inactivityLimitCountdown <= 2) {
				this.logger.info(`A moderator has been inactive for a period of time. If you are inactive for an additional ${inactivityLimitCountdown} days, it will switch to invitation only.`);
			}
		}
	}

	/**
	 * モデレーターが不在であるかどうかを確認する。trueの場合はモデレーターが不在である。
	 * isModerator, isAdministrator, isRootのいずれかがtrueのユーザを対象に、
	 * {@link MiUser.lastActiveDate}の値が実行日時の{@link MODERATOR_INACTIVITY_LIMIT_DAYS}日前よりも古いユーザがいるかどうかを確認する。
	 * {@link MiUser.lastActiveDate}がnullの場合は、そのユーザは確認の対象外とする。
	 *
	 * -----
	 *
	 * ### サンプルパターン
	 * - 実行日時: 2022-01-30 12:00:00
	 * - 判定基準: 2022-01-23 12:00:00（実行日時の{@link MODERATOR_INACTIVITY_LIMIT_DAYS}日前）
	 *
	 * #### パターン①
	 * - モデレータA: lastActiveDate = 2022-01-20 00:00:00 ※アウト
	 * - モデレータB: lastActiveDate = 2022-01-23 12:00:00 ※セーフ（ギリギリ残り0日）
	 * - モデレータC: lastActiveDate = 2022-01-23 11:59:59 ※アウト（残り-1日）
	 * - モデレータD: lastActiveDate = null
	 *
	 * この場合、モデレータBのアクティビティのみ判定基準日よりも古くないため、モデレーターが在席と判断される。
	 *
	 * #### パターン②
	 * - モデレータA: lastActiveDate = 2022-01-20 00:00:00 ※アウト
	 * - モデレータB: lastActiveDate = 2022-01-22 12:00:00 ※アウト（残り-1日）
	 * - モデレータC: lastActiveDate = 2022-01-23 11:59:59 ※アウト（残り-1日）
	 * - モデレータC: lastActiveDate = null
	 *
	 * この場合、モデレータA, B, Cのアクティビティは判定基準日よりも古いため、モデレーターが不在と判断される。
	 */
	@bindThis
	public async evaluateModeratorsInactiveDays() {
		const today = new Date();
		const inactivePeriod = new Date(today);
		inactivePeriod.setDate(today.getDate() - MODERATOR_INACTIVITY_LIMIT_DAYS);

		// TODO: モデレーター以外にも特別な権限を持つユーザーがいる場合は考慮する
		const moderators = await this.roleService.getModerators(true, true);
		const inactiveModeratorCount = moderators
			.map(it => it.lastActiveDate)
			.filter(it => it != null)
			.filter(it => it.getTime() < inactivePeriod.getTime())
			.length;

		return {
			isModeratorsInactive: inactiveModeratorCount !== moderators.length,
			inactivityLimitCountdown: MODERATOR_INACTIVITY_LIMIT_DAYS - Math.floor((today.getTime() - inactivePeriod.getTime()) / ONE_DAY_MILLI_SEC),
		};
	}

	@bindThis
	public async changeToInvitationOnly() {
		const meta = await this.metaService.fetch(true);
		meta.disableRegistration = true;
		await this.metaService.update(meta);
	}
}
