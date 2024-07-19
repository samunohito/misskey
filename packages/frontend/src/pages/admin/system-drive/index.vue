<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #default>
		<div class="_gaps">
			<div :class="$style.gridArea">
				<MkGrid :data="gridItems" :settings="setupGrid()" @event="onGridEvent"/>
			</div>

			<MkPagingButtons :current="currentPage" :max="allPages" :buttonCount="5" @pageChanged="onPageChanged"/>

			<div :class="$style.buttons">
				<!--				<MkButton danger style="margin-right: auto" @click="onDeleteButtonClicked">{{ i18n.ts.delete }}</MkButton>-->
				<!--				<MkButton primary :disabled="updateButtonDisabled" @click="onUpdateButtonClicked">-->
				<!--					{{-->
				<!--						i18n.ts.update-->
				<!--					}}-->
				<!--				</MkButton>-->
				<!--				<MkButton @click="onGridResetButtonClicked">{{ i18n.ts.reset }}</MkButton>-->
			</div>
		</div>
	</template>
</MkStickyContainer>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { GridSortOrder, RequestLogItem } from '@/pages/admin/custom-emojis-manager.impl.js';
import MkGrid from '@/components/grid/MkGrid.vue';
import { i18n } from '@/i18n.js';
import { GridCellValidationEvent, GridCellValueChangeEvent, GridEvent } from '@/components/grid/grid-event.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import MkPagingButtons from '@/components/MkPagingButtons.vue';
import { GridSetting } from '@/components/grid/grid.js';

type GridItem = {
	checked: boolean;
	id: string;
	name: string;
	fileType: string | null;
	size: string | null;
	comment: string | null;
	url: string | null;
	thumbnailUrl: string | null;
	isSensitive: boolean | null;
	isLink: boolean | null;
	kind: 'file' | 'folder'
}

function setupGrid(): GridSetting {
	return {
		row: {
			showNumber: true,
			selectable: true,
			// グリッドの行数をあらかじめ100行確保する
			minimumDefinitionCount: 100,
			events: {
				delete(rows) {
					// 行削除時は元データの行を消さず、削除対象としてマークするのみにする
					for (const row of rows) {
						gridItems.value[row.index].checked = true;
					}
				},
			},
		},
		cols: [
			{ bindTo: 'checked', icon: 'ti-trash', type: 'boolean', editable: true, width: 34 },
			{
				bindTo: 'name', title: 'name', type: 'text', editable: false, width: 140, events: {
					dblclick(cell) {
						if (gridItems.value[cell.row.index].kind === 'folder') {
							currentFolderId.value = gridItems.value[cell.row.index].id;
							currentPage.value = 0;
						}
					},
				},
			},
			{ bindTo: 'type', type: 'text', editable: false, width: 90 },
			{ bindTo: 'size', type: 'text', editable: false, width: 90 },
			{ bindTo: 'isSensitive', type: 'boolean', editable: false, width: 90 },
			{ bindTo: 'comment', type: 'text', editable: false, width: 180 },
		],
		cells: {},
	};
}

const allPages = ref<number>(0);
const currentPage = ref<number>(0);
const currentFolderId = ref<string | null>(null);

const queryName = ref<string | null>(null);
const queryCategory = ref<string | null>(null);
const queryAliases = ref<string | null>(null);
const queryType = ref<string | null>(null);
const queryLicense = ref<string | null>(null);
const queryUpdatedAtFrom = ref<string | null>(null);
const queryUpdatedAtTo = ref<string | null>(null);
const querySensitive = ref<string | null>(null);
const queryLocalOnly = ref<string | null>(null);
const queryRoles = ref<{ id: string, name: string }[]>([]);
const previousQuery = ref<string | undefined>(undefined);
const sortOrders = ref<GridSortOrder[]>([]);
const requestLogs = ref<RequestLogItem[]>([]);

const gridItems = ref<GridItem[]>([]);
const originGridItems = ref<GridItem[]>([]);
const updateButtonDisabled = ref<boolean>(false);

watch(currentPage, () => {
	refreshDriveItems();
});
watch(currentFolderId, () => {
	refreshDriveItems();
});

async function onPageChanged(pageNumber: number) {
	currentPage.value = pageNumber;
}

function onGridEvent(event: GridEvent) {
	switch (event.type) {
		case 'cell-validation':
			onGridCellValidation(event);
			break;
		case 'cell-value-change':
			onGridCellValueChange(event);
			break;
	}
}

function onGridCellValidation(event: GridCellValidationEvent) {
	updateButtonDisabled.value = event.all.filter(it => !it.valid).length > 0;
}

function onGridCellValueChange(event: GridCellValueChangeEvent) {
	const { row, column, newValue } = event;
	if (gridItems.value.length > row.index && column.setting.bindTo in gridItems.value[row.index]) {
		gridItems.value[row.index][column.setting.bindTo] = newValue;
	}
}

async function refreshDriveItems() {
	const result = await misskeyApi('admin/drive/system/explore', {
		currentFolderId: currentFolderId.value,
		query: {},
		limit: 100,
		page: currentPage.value,
	});

	gridItems.value = result.items.map((it: Misskey.entities.DriveExploreItem) => ({
		checked: false,
		id: it.id,
		name: it.name,
		fileType: it.fileType,
		size: it.size,
		comment: it.comment,
		url: it.url,
		thumbnailUrl: it.thumbnailUrl,
		isSensitive: it.isSensitive,
		isLink: it.isLink,
		kind: it.kind,
	}));
	allPages.value = result.allPages;
}

onMounted(async () => {
	await refreshDriveItems();
});

</script>

<style module lang="scss">
.violationRow {
	background-color: var(--infoWarnBg);
}

.changedRow {
	background-color: var(--infoBg);
}

.editedRow {
	background-color: var(--infoBg);
}

.row1 {
	grid-row: 1 / 2;
}

.row2 {
	grid-row: 2 / 3;
}

.row3 {
	grid-row: 3 / 4;
}

.row4 {
	grid-row: 4 / 5;
}

.col1 {
	grid-column: 1 / 2;
}

.col2 {
	grid-column: 2 / 3;
}

.col3 {
	grid-column: 3 / 4;
}

.searchArea {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr;
	gap: 16px;
}

.searchAreaSp {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.searchButtons {
	display: flex;
	justify-content: flex-end;
	align-items: flex-end;
	gap: 8px;
}

.searchButtonsSp {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 8px;
}

.gridArea {
	padding-top: 8px;
	padding-bottom: 8px;
}

.buttons {
	display: flex;
	align-items: flex-end;
	justify-content: center;
	gap: 8px;
	flex-wrap: wrap;
}

.divider {
	margin: 8px 0;
	border-top: solid 0.5px var(--divider);
}

</style>
