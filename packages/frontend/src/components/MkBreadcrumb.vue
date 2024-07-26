<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" :style="{ gap: gaps + 'px' }">
	<div :class="$style.folder" :style="{ gap: gaps + 'px' }">
		<div>{{ separator }}</div>
		<div>
			<MkA @click="onClick(-1, null, $event)">(root)</MkA>
		</div>
	</div>
	<div v-for="(hierarchy, index) in hierarchies" :key="index" :class="$style.folder" :style="{ gap: gaps + 'px' }">
		<div>{{ separator }}</div>
		<div>
			<MkA @click="onClick(index, hierarchy, $event)">{{ valueConverter(hierarchy) }}</MkA>
		</div>
	</div>
</div>
</template>

<script setup lang="ts" generic="T = string">

const emit = defineEmits<{
	(ev: 'click', event: MouseEvent, idx: number, value: T | null): void;
}>();

withDefaults(defineProps<{
	hierarchies: T[];
	valueConverter?: (value: T) => string;
	separator?: string;
	gaps?: number;
}>(), {
	valueConverter: (value: T) => value as unknown as string,
	separator: '/',
	gaps: 2,
});

function onClick(idx: number, value: T | null, event: MouseEvent) {
	emit('click', event, idx, value);
}
</script>

<style module lang="scss">
.root {
	display: flex;
	flex-direction: row;
	align-items: center;
}

.folder {
	display: flex;
	flex-direction: row;
	align-items: center;
}
</style>
