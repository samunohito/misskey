<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_gaps_s">
	<div :class="$style.icon">
		<span v-if="thumbType === 'file'" class="ti ti-file" style="line-height: normal"/>
		<span v-else-if="thumbType === 'folder'" class="ti ti-folder" style="line-height: normal"/>
		<img
			v-else-if="thumbType === 'image'"
			:src="item.thumbnailUrl ?? undefined"
			:class="$style.thumbnail"
			:alt="item.comment ?? ''"
		/>
	</div>
	<div>
		<span>{{ props.cell.value }}</span>
	</div>
</div>
</template>

<script setup lang="ts">

import { computed, onMounted, toRefs } from 'vue';
import { CellValue, GridCell } from '@/components/grid/cell.js';
import { XCellNameParams } from '@/pages/admin/system-drive/types.js';

const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];

const props = defineProps<{
	cell: GridCell;
	extraParams: XCellNameParams;
	mounted: () => void;
}>();

const { item, batchRename } = toRefs(props.extraParams);

const thumbType = computed(() => {
	const _item = item.value;
	switch (true) {
		case _item.fileType && imageMimeTypes.includes(_item.fileType):
			return 'image';
		case _item.kind === 'folder':
			return 'folder';
		default:
			return 'file';
	}
});

/**
 * 編集モード開始時にセル側から呼び出される.
 * この関数が未実装だと編集モードにならない.
 *
 * @return falseを返すと編集モードにならない
 */
function beginEdit(): boolean {
	console.log('beginEdit', batchRename.value);
	if (!batchRename.value) {
		// 一括リネームモードでない場合は編集モードにならない
		return false;
	}

	return true;
}

/**
 * 編集モード終了時にセル側から呼び出される.
 * 編集モードが解除されるタイミングとしては、編集中のセル以外がクリックされた場合、escキーやenterキーが押下された場合がある.
 *
 * @return この値がセルおよびグリッドにbindした値に書き込まれる
 */
function endEdit(): CellValue {
	return item.value.name;
}

onMounted(() => {
	// サイズ計算のため、かならず呼び出す必要がある
	props.mounted();
});

defineExpose({
	beginEdit,
	endEdit,
});
</script>

<style module lang="scss">
$iconSize: 18px;

.root {
	display: flex;
	flex-direction: row;
	align-items: center;
	padding-left: 8px;
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
