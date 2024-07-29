<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="consoleEl" :class="$style.root" :style="{ overflowX: wordWrap ? 'hidden' : 'scroll' }">
	<div
		v-for="line in lines" :key="line.key" :class="[
			$style.line,
			{[$style.wordWrap]: wordWrap},
			{[$style.noWrap]: !wordWrap}
		]"
	>
		{{ line.text }}
	</div>
</div>
</template>

<script setup lang="ts" generic="T = string">
import { computed, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
	logs: T[];
	lineFilter?: (line: T) => boolean;
	lineConverter?: (line: T) => string;
	lineCount?: number;
	autoScroll?: boolean;
	wordWrap?: boolean;
	showTimestamp?: boolean;
}>(), {
	lineFilter: () => true,
	lineConverter: (line: T) => line as unknown as string,
	lineCount: 1000,
	autoScroll: true,
	wordWrap: false,
	showTimestamp: true,
});

const consoleEl = ref<InstanceType<typeof HTMLDivElement>>();

const lines = computed(() => {
	return props.logs.slice(-props.lineCount)
		.filter(props.lineFilter)
		.map(it => (props.showTimestamp ? '[' + new Date().toLocaleString() + ']\t' : '') + props.lineConverter(it))
		.map(line => ({
			key: Date.now(),
			text: line,
		}));
});

watch(() => props.autoScroll, () => {
	if (props.autoScroll && consoleEl.value) {
		consoleEl.value.scrollTop = consoleEl.value.scrollHeight;
	}
});

watch(lines, () => {
	if (props.autoScroll && consoleEl.value) {
		consoleEl.value.scrollTop = consoleEl.value.scrollHeight;
	}
}, { immediate: true });

defineExpose({
	lines,
});
</script>

<style module lang="scss">
.root {
	display: flex;
	flex-direction: column;
	justify-content: stretch;
	align-items: start;
	overflow-y: scroll;
}

.line {
	padding: 2px 4px;
	border-bottom: dotted 0.5px var(--divider);
	width: 100%;
	box-sizing: border-box;

	&:last-child {
		border: none;
	}
}

.noWrap {
	white-space: nowrap;
}

.wordWrap {
	max-width: 100%;
	white-space: pre-wrap;
	overflow-wrap: break-word;
	word-break: break-all;
}
</style>
