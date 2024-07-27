<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<!-- コンテナが入れ子になるのでz-indexが被らないよう大きめの数値を設定する-->
	<MkStickyContainer :headerZIndex="2000">
		<template #header>
			<MkPageHeader/>
		</template>
		<MkStickyContainer>
			<template #default>
				<div :class="$style.root" class="_gaps">
					<MkFolder>
						<template #icon><i class="ti ti-cloud"></i></template>
						<template #label>{{ i18n.ts._drive.searchSettings }}</template>
						<template #caption>
							{{ i18n.ts._drive.searchSettingCaption }}
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
									<template #label>fileType</template>
								</MkInput>
								<MkInput
									v-model="queryComment"
									type="search"
									autocapitalize="off"
									:class="[$style.col3, $style.row1]"
									@enter="onSearchRequest"
								>
									<template #label>comment</template>
								</MkInput>

								<MkInput
									v-model="querySizeMin"
									type="number"
									autocapitalize="off"
									:min="0"
									:class="[$style.col1, $style.row2]"
									@enter="onSearchRequest"
								>
									<template #label>size-min</template>
								</MkInput>
								<MkInput
									v-model="querySizeMax"
									type="search"
									autocapitalize="off"
									:min="0"
									:class="[$style.col2, $style.row2]"
									@enter="onSearchRequest"
								>
									<template #label>size-max</template>
								</MkInput>
								<MkSelect
									v-model="queryKind"
									:class="[$style.col3, $style.row2]"
								>
									<template #label>kind</template>
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

							<MkFolder :spacerMax="8" :spacerMin="8">
								<template #icon><i class="ti ti-arrows-sort"></i></template>
								<template #label>{{ i18n.ts._customEmojisManager._gridCommon.sortOrder }}</template>
								<MkSortOrderEditor
									:baseOrderKeyNames="itemSortKeys"
									:currentOrders="sortOrders"
									@update="onSortOrderUpdate"
								/>
							</MkFolder>

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

					<div :class="$style.gridArea" class="_gaps_s">
						<div :class="$style.breadcrumbArea" class="_gaps_s _panel">
							<div>
								<span class="ti ti-folder"/>
							</div>

							<MkBreadcrumb
								:hierarchies="pathHierarchies"
								:valueConverter="value => value.name"
								@click="onBreadcrumbClicked"
							/>
						</div>

						<MkGrid :data="gridItems" :settings="setupGrid()" @event="onGridEvent"/>
					</div>

					<MkPagingButtons :current="currentPage" :max="allPages" :buttonCount="5" @pageChanged="onPageChanged"/>

					<div :class="$style.buttons">
						<MkButton danger style="margin-right: auto" @click="onDeleteButtonClicked">{{ i18n.ts.delete }}</MkButton>
						<MkButton @click="onGridResetButtonClicked">{{ i18n.ts.reset }}</MkButton>
					</div>
				</div>
			</template>
		</MkStickyContainer>
	</MkStickyContainer>
</div>
</template>

<script setup lang="ts">
import { computed, onMounted, Ref, ref, useCssModule } from 'vue';
import * as Misskey from 'misskey-js';
import XNameCell from './cell-file-name.vue';
import * as os from '@/os.js';
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
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSortOrderEditor from '@/components/MkSortOrderEditor.vue';
import { SortOrder } from '@/components/MkSortOrderEditor.define.js';
import { deviceKind } from '@/scripts/device-kind.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import { emptyStrToUndefined } from '@/scripts/str.js';
import { createCustomCellTemplate } from '@/components/grid/column.js';
import { useStream } from '@/stream.js';

const itemSortKeys = [
	'id',
	'name',
	'fileType',
	'size',
	'comment',
	'isSensitive',
	'isLink',
	'kind',
];
type ItemSortKey = typeof itemSortKeys[number];

function setupGrid(): GridSetting {
	const $style = useCssModule();

	return {
		row: {
			showNumber: true,
			selectable: true,
			// グリッドの行数をあらかじめ100行確保する
			minimumDefinitionCount: 100,
			styleRules: [
				{
					// 初期値から変わっていたら背景色を変更
					condition: ({ row }) => JSON.stringify(gridItems.value[row.index]) !== JSON.stringify(originGridItems.value[row.index]),
					applyStyle: { className: $style.changedRow },
				},
				{
					// バリデーションに引っかかっていたら背景色を変更
					condition: ({ cells }) => cells.some(it => !it.violation.valid),
					applyStyle: { className: $style.violationRow },
				},
			],
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
				bindTo: 'name', title: 'name', type: 'custom', editable: false, width: 280,
				customTemplate: createCustomCellTemplate<typeof XNameCell>(
					() => XNameCell,
					(cell: GridCell) => gridItems.value[cell.row.index],
				),
				events: {
					async dblclick(cell) {
						const item = gridItems.value[cell.row.index];
						switch (item.kind) {
							case 'file': {
								os.pageWindow(`/admin/file/${item.id}`);
								break;
							}
							case 'folder': {
								await refreshDriveItems(item.id, 1);
								break;
							}
						}
					},
				},
			},
			{ bindTo: 'fileType', type: 'text', editable: false, width: 90 },
			{
				bindTo: 'size', title: 'size(kb)', type: 'text', editable: false, width: 90, align: 'right',
				valueTransformer(row, col, val) {
					if (gridItems.value[row.index].kind === 'file') {
						return `${Math.floor((val as number ?? 0) / 100) / 10} KB`;
					} else {
						return '';
					}
				},
			},
			{ bindTo: 'isSensitive', type: 'boolean', editable: false, width: 90 },
			{ bindTo: 'isLink', type: 'boolean', editable: false, width: 90 },
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
const queryKind = ref<'file' | 'folder' | null>(null);
const sortOrders = ref<SortOrder<ItemSortKey>[]>([]);

const pathHierarchies: Ref<Misskey.entities.DriveFolder[]> = ref([]);
const spMode = computed(() => ['smartphone', 'tablet'].includes(deviceKind));

const gridItems = ref<GridItem[]>([]);
const originGridItems = ref<GridItem[]>([]);
const updateButtonDisabled = ref<boolean>(false);

const connection = useStream().useChannel('drive');

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

function onSortOrderUpdate(_sortOrders: SortOrder<ItemSortKey>[]) {
	sortOrders.value = _sortOrders;
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

async function onDeleteButtonClicked() {
	const _items = gridItems.value;
	const _originItems = originGridItems.value;
	if (_items.length !== _originItems.length) {
		throw new Error('The number of items has been changed. Please refresh the page and try again.');
	}

	const deleteItems = _items.filter((it) => it.checked);
	if (deleteItems.length === 0) {
		await os.alert({
			type: 'info',
			text: i18n.ts._drive.alertDeleteFilesNothingDescription,
		});
		return;
	}

	const confirm = await os.confirm({
		type: 'info',
		title: i18n.ts._drive.confirmDeleteFilesTitle,
		text: i18n.tsx._drive.confirmDeleteFilesDescription({ count: deleteItems.length }),
	});
	if (confirm.canceled) {
		return;
	}

	function action() {
		return Promise.all(deleteItems.map(it => misskeyApi('drive/files/delete', { fileId: it.id })));
	}

	await os.promiseDialog(
		action(),
	);
}

function onGridResetButtonClicked() {
	gridItems.value = JSON.parse(JSON.stringify(originGridItems.value));
}

async function onPageChanged(pageNumber: number) {
	await refreshDriveItems(currentFolderId.value, pageNumber);
}

async function onBreadcrumbClicked(event: MouseEvent, index: number, value: Misskey.entities.DriveFolder | null) {
	await refreshDriveItems(value?.id ?? null, 1);
}

async function onSearchRequest() {
	await refreshDriveItems(currentFolderId.value, 1);
}

function onQueryResetButtonClicked() {
	queryName.value = null;
	queryFileType.value = null;
	queryComment.value = null;
	querySizeMin.value = null;
	querySizeMax.value = null;
	querySensitive.value = null;
	queryLink.value = null;
	queryKind.value = null;
}

function onStreamDriveFileUpdated(file: Misskey.entities.DriveFile) {
	const index = gridItems.value.findIndex(it => it.id === file.id);
	if (index !== -1) {
		const item = gridItems.value[index];
		gridItems.value[index] = {
			...item,
			name: file.name,
			fileType: file.type,
			size: file.size,
			comment: file.comment,
			url: file.url,
			thumbnailUrl: file.thumbnailUrl,
			isSensitive: file.isSensitive,
		};
	}
}

function onStreamDriveFileDeleted(fileId: string) {
	gridItems.value = gridItems.value.filter(it => it.id !== fileId);
	originGridItems.value = originGridItems.value.filter(it => it.id !== fileId);
}

function onStreamDriveFolderUpdated(updatedFolder: Misskey.entities.DriveFolder) {
	const index = gridItems.value.findIndex(it => it.id === updatedFolder.id);
	if (index !== -1) {
		const item = gridItems.value[index];
		gridItems.value[index] = {
			...item,
			name: updatedFolder.name,
		};
	}
}

function onStreamDriveFolderDeleted(folderId: string) {
	gridItems.value = gridItems.value.filter(it => it.id !== folderId);
	originGridItems.value = originGridItems.value.filter(it => it.id !== folderId);
}

async function refreshDriveItems(folderId: string | null, page: number) {
	pathHierarchies.value = await misskeyApi('admin/drive/system/folders/pwd', {
		currentFolderId: folderId,
	}).then(it => it.hierarchies);

	const result = await os.promiseDialog(
		misskeyApi('admin/drive/system/explore', {
			currentFolderId: folderId,
			query: {
				name: emptyStrToUndefined(queryName.value),
				fileType: emptyStrToUndefined(queryFileType.value),
				comment: emptyStrToUndefined(queryComment.value),
				sizeMin: querySizeMin.value ? parseInt(querySizeMin.value) : undefined,
				sizeMax: querySizeMax.value ? parseInt(querySizeMax.value) : undefined,
				sensitive: querySensitive.value === 'true' ? true : querySensitive.value === 'false' ? false : undefined,
				link: queryLink.value === 'true' ? true : queryLink.value === 'false' ? false : undefined,
				kinds: queryKind.value ? [queryKind.value] : undefined,
			},
			limit: 100,
			page: page,
		}),
		() => {
		},
		() => {
		},
	);

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
	originGridItems.value = JSON.parse(JSON.stringify(gridItems.value));
}

onMounted(async () => {
	await refreshDriveItems(null, 1);

	connection.on('fileUpdated', onStreamDriveFileUpdated);
	connection.on('fileDeleted', onStreamDriveFileDeleted);
	connection.on('folderUpdated', onStreamDriveFolderUpdated);
	connection.on('folderDeleted', onStreamDriveFolderDeleted);
});

definePageMetadata(() => ({
	title: i18n.ts._drive._system.title,
	icon: 'ti ti-icons',
}));
</script>

<style module lang="scss">
.root {
	padding: 16px;
}

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

.breadcrumbArea {
	display: flex;
	flex-direction: row;
	align-items: center;
	padding: 8px;
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
