<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #default>
		<div class="_gaps">
			<MkFolder>
				<template #icon><i class="ti ti-cloud"></i></template>
				<template #label>{{ i18n.ts._drive._system.searchSettings }}</template>
				<template #caption>
					{{ i18n.ts._drive._system.searchSettingCaption }}
				</template>

				<div class="_gaps">
					<div :class="[[spMode ? $style.searchAreaSp : $style.searchArea]]">
						<MkInput
							v-model="queryName"
							type="search"
							autocapitalize="off"
							:class="[$style.col1, $style.row1]"
							@enter="onSearchRequest"
						>
							<template #label>name</template>
						</MkInput>
						<MkInput
							v-model="queryFileType"
							type="search"
							autocapitalize="off"
							:class="[$style.col2, $style.row1]"
							@enter="onSearchRequest"
						>
							<template #label>category</template>
						</MkInput>
						<MkInput
							v-model="queryComment"
							type="search"
							autocapitalize="off"
							:class="[$style.col3, $style.row1]"
							@enter="onSearchRequest"
						>
							<template #label>aliases</template>
						</MkInput>

						<MkInput
							v-model="querySizeMin"
							type="number"
							min="0"
							autocapitalize="off"
							:class="[$style.col1, $style.row2]"
							@enter="onSearchRequest"
						>
							<template #label>type</template>
						</MkInput>
						<MkInput
							v-model="querySizeMax"
							type="search"
							min="0"
							autocapitalize="off"
							:class="[$style.col2, $style.row2]"
							@enter="onSearchRequest"
						>
							<template #label>license</template>
						</MkInput>
						<MkSelect
							v-model="queryKind"
							:class="[$style.col3, $style.row2]"
						>
							<template #label>sensitive</template>
							<option :value="null">-</option>
							<option :value="'file'">file</option>
							<option :value="'folder'">folder</option>
						</MkSelect>

						<MkSelect
							v-model="queryLink"
							:class="[$style.col1, $style.row3]"
						>
							<template #label>link</template>
							<option :value="null">-</option>
							<option :value="true">true</option>
							<option :value="false">false</option>
						</MkSelect>
						<MkSelect
							v-model="querySensitive"
							:class="[$style.col2, $style.row3]"
						>
							<template #label>sensitive</template>
							<option :value="null">-</option>
							<option :value="true">true</option>
							<option :value="false">false</option>
						</MkSelect>
					</div>

					<XSortOrderFolder :sortOrders="sortOrders" @update="onSortOrderUpdate"/>

					<div :class="[[spMode ? $style.searchButtonsSp : $style.searchButtons]]">
						<MkButton primary @click="onSearchRequest">
							{{ i18n.ts.search }}
						</MkButton>
						<MkButton @click="onQueryResetButtonClicked">
							{{ i18n.ts.reset }}
						</MkButton>
					</div>
				</div>
			</MkFolder>

			<div style="height: 30px">
				<MkBreadcrumb
					:hierarchies="pathHierarchies"
					:valueConverter="value => value.name"
					@click="onBreadcrumbClicked"
				/>
			</div>

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
import { defineAsyncComponent, onMounted, Ref, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { GridSortOrder, RequestLogItem } from '@/pages/admin/custom-emojis-manager.impl.js';
import MkGrid from '@/components/grid/MkGrid.vue';
import { GridCellValidationEvent, GridCellValueChangeEvent, GridEvent } from '@/components/grid/grid-event.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import MkPagingButtons from '@/components/MkPagingButtons.vue';
import { GridSetting } from '@/components/grid/grid.js';
import { GridCell } from '@/components/grid/cell.js';
import { GridItem } from '@/pages/admin/system-drive/types.js';
import MkBreadcrumb from '@/components/MkBreadcrumb.vue';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import XSortOrderFolder from '@/pages/admin/custom-emojis-manager.sort-order-folder.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';

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
				bindTo: 'name', title: 'name', type: 'custom', editable: false, width: 140,
				customTemplate: {
					template: () => {
						return defineAsyncComponent(() => import('./cell-file-name.vue'));
					},
					extraParams: (cell: GridCell) => gridItems.value[cell.row.index],
					events: {
						cellEditing(cell, context) {
							console.log('peeeeeeeeeeee', cell);
						},
					},
				},
				events: {
					async dblclick(cell) {
						if (gridItems.value[cell.row.index].kind === 'folder') {
							await refreshDriveItems(gridItems.value[cell.row.index].id, 1);
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
const currentPage = ref<number>(1);
const currentFolderId = ref<string | null>(null);

const queryName = ref<string | null>(null);
const queryFileType = ref<string | null>(null);
const queryComment = ref<string | null>(null);
const querySizeMin = ref<string | null>(null);
const querySizeMax = ref<string | null>(null);
const querySensitive = ref<string | null>(null);
const queryLink = ref<string | null>(null);
const queryKind = ref<string | null>(null);
const sortOrders = ref<GridSortOrder[]>([]);
const requestLogs = ref<RequestLogItem[]>([]);

const pathHierarchies: Ref<Misskey.entities.DriveFolder[]> = ref([]);

const gridItems = ref<GridItem[]>([]);
const originGridItems = ref<GridItem[]>([]);
const updateButtonDisabled = ref<boolean>(false);

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

async function onPageChanged(pageNumber: number) {
	await refreshDriveItems(currentFolderId.value, pageNumber);
}

async function onBreadcrumbClicked(event: MouseEvent, index: number, value: Misskey.entities.DriveFolder | null) {
	await refreshDriveItems(value?.id ?? null, 1);
}

async function refreshDriveItems(folderId: string | null, page: number) {
	pathHierarchies.value = await misskeyApi('admin/drive/system/folders/pwd', {
		currentFolderId: folderId,
	}).then(it => it.hierarchies);

	const result = await misskeyApi('admin/drive/system/explore', {
		currentFolderId: folderId,
		query: {},
		limit: 100,
		page: page,
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

	currentFolderId.value = folderId;
	currentPage.value = page;
}

onMounted(async () => {
	await refreshDriveItems(null, 1);
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
