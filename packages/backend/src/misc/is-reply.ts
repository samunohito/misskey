/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from '@/models/User.js';
import * as misskey from "misskey-js"

type Note = misskey.entities.Note

export function isReply(note: Note, viewerId?: MiUser['id'] | undefined | null): boolean {
	// REVIEW
	// return note.replyId && note.replyUserId !== note.userId && note.replyUserId !== viewerId;
	return !!note.replyId && note.reply?.userId !== note.userId && note.reply?.userId !== viewerId;
}
