<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="modal"
	:preferType="'dialog'"
	:width="600"
	:height="350"
	:withOkButton="false"
	:okButtonDisabled="false"
	@click="modal?.close()"
	@close="modal?.close()"
	@closed="onModalClosed()"
>
	<template #header>
		<i class="ti ti-upload"></i><span> {{ i18n.ts.upload }}</span>
	</template>

	<div :class="$style.root" class="_gaps">
		<div
			:class="[$style.uploadBox, [isDragOver ? $style.dragOver : {}]]"
			@dragover.prevent="isDragOver = true"
			@dragleave.prevent="isDragOver = false"
			@drop.prevent.stop="onDrop"
		>
			<div style="margin-top: 1em">
				{{ i18n.ts._drive._upload.fileInputAreaCaption }}
			</div>
			<div :class="$style.path" class="_gaps_s" style="width: 100%">
				<div>
					{{ i18n.ts._drive._upload.uploadTo }}:
				</div>

				<MkBreadcrumb
					:hierarchies="pathHierarchies"
					:valueConverter="value => value.name"
					:clickable="false"
				/>
			</div>

			<ul>
				<li>{{ i18n.ts._drive._upload.fileInputAreaList1 }}</li>
				<li><a @click.prevent="onFileSelectClicked">{{ i18n.ts._drive._upload.fileInputAreaList2 }}</a></li>
			</ul>
		</div>

		<div style="height: 100%; overflow-y: hidden">
			<div :class="$style.log">
				<MkLogConsole :logs="logs"/>
			</div>
		</div>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">
import { onMounted, Ref, ref, shallowRef, toRefs } from 'vue';
import * as Misskey from 'misskey-js';
import MkModal from '@/components/MkModal.vue';
import { i18n } from '@/i18n.js';
import { extractDroppedItems, flattenDroppedFiles } from '@/scripts/file-drop.js';
import * as os from '@/os.js';
import { uploadFile } from '@/scripts/upload.js';
import MkLogConsole from '@/components/MkLogConsole.vue';
import { chooseFileFromPc } from '@/scripts/select-file.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkBreadcrumb from '@/components/MkBreadcrumb.vue';
import { misskeyApi } from '@/scripts/misskey-api.js';

const emit = defineEmits<{
	(ev: 'closed', uploaded: boolean): void;
}>();

const props = withDefaults(defineProps<{
	selectedFolderId?: string | null;
	keepOriginalUploading?: boolean;
}>(), {
	selectedFolderId: null,
	keepOriginalUploading: false,
});

const { selectedFolderId, keepOriginalUploading } = toRefs(props);

const modal = shallowRef<InstanceType<typeof MkModal>>();

const pathHierarchies: Ref<Misskey.entities.DriveFolder[]> = ref([]);
const isDragOver = ref<boolean>(false);
const logs = ref<string[]>([]);
const uploaded = ref(false);

async function updatePath(newFolderId: string | null) {
	pathHierarchies.value = await misskeyApi('admin/drive/system/folders/pwd', {
		currentFolderId: newFolderId,
	}).then(it => it.hierarchies);
}

async function onDrop(ev: DragEvent) {
	isDragOver.value = false;

	const droppedFiles = await extractDroppedItems(ev).then(it => flattenDroppedFiles(it));
	const confirm = await os.confirm({
		type: 'info',
		title: i18n.ts._customEmojisManager._local._register.confirmUploadEmojisTitle,
		text: i18n.tsx._customEmojisManager._local._register.confirmUploadEmojisDescription({ count: droppedFiles.length }),
	});
	if (confirm.canceled) {
		return;
	}

	try {
		await os.promiseDialog(
			Promise.all(
				droppedFiles.map(async it => {
					try {
						let res = await uploadFile(
							it.file,
							selectedFolderId.value,
							it.file.name.replace(/\.[^.]+$/, ''),
							keepOriginalUploading.value,
							true,
						);
						logs.value.push('✅ Uploaded: ' + it.file.name + ' -> ' + res.url);
						uploaded.value = true;
					} catch (err) {
						logs.value.push('❌ Failed to upload: ' + it.file.name + ' -> ' + JSON.stringify(err));
					}
				}),
			),
			() => {
			},
			() => {
			},
		);
	} catch (err) {
		// ダイアログは共通部品側で出ているはずなので何もしない
		return;
	}
}

async function onFileSelectClicked() {
	try {
		const files = await chooseFileFromPc(
			true,
			{
				uploadFolder: selectedFolderId.value,
				keepOriginal: keepOriginalUploading.value,
				// 拡張子は消す
				nameConverter: (file) => file.name.replace(/\.[a-zA-Z0-9]+$/, ''),
			},
		);

		for (const file of files) {
			logs.value.push('✅ Uploaded: ' + file.name + ' -> ' + file.url);
		}

		uploaded.value = true;
	} catch (err) {
		logs.value.push('❌ Failed to upload: ' + JSON.stringify(err));
	}
}

function onModalClosed() {
	emit('closed', uploaded.value);
}

onMounted(async () => {
	await updatePath(selectedFolderId.value);
});
</script>

<style module lang="scss">
.root {
	display: flex;
	flex-direction: column;
	justify-content: start;
	align-items: stretch;
	width: 100%;
	height: 100%;
	box-sizing: border-box;
	padding: var(--margin);
}

.path {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: center;
}

.uploadBox {
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	width: 100%;
	height: auto;
	border: 0.5px dotted var(--accentedBg);
	border-radius: var(--border-radius);
	background-color: var(--accentedBg);
	box-sizing: border-box;

	&.dragOver {
		cursor: copy;
	}
}

.log {
	width: 100%;
	height: 100%;
}
</style>
