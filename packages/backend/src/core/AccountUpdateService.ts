/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { delay, inject, injectable } from 'tsyringe';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { RelayService } from '@/core/RelayService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';

@injectable()
export class AccountUpdateService {
	constructor(
		@inject(DI.usersRepository)
		private usersRepository: UsersRepository,@inject(delay(() => UserEntityService)) private userEntityService: UserEntityService,@inject(delay(() => ApRendererService)) private apRendererService: ApRendererService,@inject(delay(() => ApDeliverManagerService)) private apDeliverManagerService: ApDeliverManagerService,@inject(delay(() => RelayService)) private relayService: RelayService) {
	}

	@bindThis
	public async publishToFollowers(userId: MiUser['id']) {
		const user = await this.usersRepository.findOneBy({ id: userId });
		if (user == null) throw new Error('user not found');

		// フォロワーがリモートユーザーかつ投稿者がローカルユーザーならUpdateを配信
		if (this.userEntityService.isLocalUser(user)) {
			const content = this.apRendererService.addContext(this.apRendererService.renderUpdate(await this.apRendererService.renderPerson(user), user));
			this.apDeliverManagerService.deliverToFollowers(user, content);
			this.relayService.deliverToRelays(user, content);
		}
	}
}
