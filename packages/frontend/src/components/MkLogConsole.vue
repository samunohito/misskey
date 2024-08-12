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
		<MkButton icon @click="onSettingButtonClicked"><span class="ti ti-settings"/></MkButton>
		<MkButton icon @click="onCopyButtonClicked"><span class="ti ti-copy"/></MkButton>
	</div>
</div>
</template>

<script setup lang="ts" generic="T = string">
import { ref, shallowRef, toRefs } from 'vue';
import MkLogConsoleSimple from '@/components/MkLogConsoleSimple.vue';
import MkButton from '@/components/MkButton.vue';
import { copyToClipboard } from '@/scripts/copy-to-clipboard.js';
import * as os from '@/os.js';

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
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const autoScroll = ref(props.autoScroll);
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const wordWrap = ref(props.wordWrap);
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const showTimestamp = ref(props.showTimestamp);

async function onSettingButtonClicked(ev: MouseEvent) {
	await os.popupMenu(
		[
			{
				type: 'switch',
				icon: 'ti ti-arrows-move-vertical',
				text: 'Auto scroll',
				ref: autoScroll,
			},
			{
				type: 'switch',
				icon: 'ti ti-text-wrap',
				text: 'Word wrap',
				ref: wordWrap,
			},
			{
				type: 'switch',
				icon: 'ti ti-clock-hour-9',
				text: 'Show timestamp',
				ref: showTimestamp,
			},
		],
		ev.currentTarget,
	);
}

function onCopyButtonClicked() {
	const text = consoleEl.value?.lines?.map(it => it.text).join('\n') ?? '';
	copyToClipboard(text);
	os.success();
}
</script>

<style module lang="scss">
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
</style>
