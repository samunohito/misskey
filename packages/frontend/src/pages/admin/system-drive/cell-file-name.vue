<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_gaps_s">
	<div :class="$style.icon">
		<span v-if="thumbType === 'file'" class="ti ti-file" style="line-height: normal"/>
		<span v-else-if="thumbType === 'folder'" class="ti ti-folder" style="line-height: normal"/>
		<img v-else-if="thumbType === 'image'" :src="item.thumbnailUrl" :class="$style.thumbnail" :alt="item.comment"/>
	</div>
	<div>{{ props.cell.value }}</div>
</div>
</template>

<script setup lang="ts">

import { computed, onMounted, ref } from 'vue';
import { GridCell } from '@/components/grid/cell.js';
import { GridItem } from '@/pages/admin/system-drive/types.js';

const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'] as const;

const props = defineProps<{
	cell: GridCell;
	extraParams: GridItem;
	mounted: () => void;
}>();

const item = computed(() => props.extraParams);
const thumbType = computed(() => {
	const _item = item.value;
	switch (true) {
		case imageMimeTypes.includes(_item.fileType):
			return 'image';
		case _item.kind === 'folder':
			return 'folder';
		default:
			return 'file';
	}
});

onMounted(() => {
	props.mounted();
});

</script>

<style module lang="scss">
$iconSize: 18px;

.root {
	display: flex;
	flex-direction: row;
	align-items: center;
}

.icon {
	display: flex;
	align-items: center;
	justify-content: center;

	width: $iconSize;
	min-width: $iconSize;
	max-width: $iconSize;
	height: 100%;
}

.thumbnail {
	width: 100%;
	max-width: 100%;
	height: auto;
	object-fit: cover;
	z-index: 100;
}
</style>
