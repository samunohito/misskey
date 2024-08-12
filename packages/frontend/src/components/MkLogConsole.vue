<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_panel">
	<MkLogConsoleSimple
		ref="consoleEl"
		:logs="logs"
		:lineFilter="lineFilter"
		:lineConverter="lineConverter"
		:lineCount="lineCount"
		:autoScroll="autoScroll"
		:wordWrap="wordWrap"
		:showTimestamp="showTimestamp"
		:placeholder="placeholder"
	/>
	<div :class="$style.buttonArea" class="_gaps_s">
		<MkButton :class="$style.rectButton"><span class="ti ti-settings"/></MkButton>
		<MkButton :class="$style.rectButton" @click="onCopyButtonClicked"><span class="ti ti-copy"/></MkButton>
	</div>
</div>
</template>

<script setup lang="ts" generic="T = string">
import { computed, ref, shallowRef, toRefs } from 'vue';
import MkLogConsoleSimple from '@/components/MkLogConsoleSimple.vue';
import MkButton from '@/components/MkButton.vue';
import { copyToClipboard } from '@/scripts/copy-to-clipboard.js';

const props = withDefaults(defineProps<{
	logs: T[];
	lineFilter?: (line: T) => boolean;
	lineConverter?: (line: T) => string;
	lineCount?: number;
	autoScroll?: boolean;
	wordWrap?: boolean;
	showTimestamp?: boolean;
	placeholder?: string;
}>(), {
	lineFilter: () => true,
	lineConverter: (line: T) => line as unknown as string,
	lineCount: 1000,
	autoScroll: true,
	wordWrap: false,
	showTimestamp: true,
	placeholder: 'No logs',
});

const consoleEl = shallowRef();
const { autoScroll, wordWrap, showTimestamp } = toRefs(props);

function onCopyButtonClicked() {
	const text = consoleEl.value?.lines?.map(it => it.text).join('\n') ?? '';
	copyToClipboard(text);
}
</script>

<style module lang="scss">
$buttonSize: 32px;

.root {
	position: relative;
	background-color: var(--bg);
	height: 100%;
	min-height: 100%;
}

.buttonArea {
	position: absolute;
	top: 8px;
	right: 16px;
	z-index: 100;
	display: flex;
}

.rectButton {
	width: $buttonSize;
	max-width: $buttonSize;
	min-width: $buttonSize;
	height: $buttonSize;
	max-height: $buttonSize;
	min-height: $buttonSize;

	padding: 0;
}
</style>
