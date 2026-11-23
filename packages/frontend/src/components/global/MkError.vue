<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkResult type="error" :text="props.title">
	<div v-if="props.text" :class="$style.text">{{ props.text }}</div>
	<MkButton :class="$style.button" rounded @click="() => emit('retry')">{{ i18n.ts.retry }}</MkButton>
</MkResult>
</template>

<script lang="ts" setup>
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

/**
 * `title` を省くと既定の見出し (`somethingHappened`) を出し、`text` を省くと本文は出さない。
 */
const props = defineProps<{
	title?: string;
	text?: string;
}>();

const emit = defineEmits<{
	(ev: 'retry'): void;
}>();
</script>

<style lang="scss" module>
.text {
	opacity: 0.7;
	font-size: 0.9em;
	// 案内の本文はエラー id などを改行で区切って含むことがある
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.button {
	margin: 0 auto;
}
</style>
