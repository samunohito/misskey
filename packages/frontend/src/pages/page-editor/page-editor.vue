<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div class="jqqmcavi">
			<MkButton v-if="pageId && author != null" class="button" inline type="routerLink" :to="`/@${ author.username }/pages/${ currentName }`"><i class="ti ti-external-link"></i> {{ i18n.ts._pages.viewPage }}</MkButton>
			<MkButton v-if="!readonly" inline primary class="button" :wait="saving" :disabled="busy" @click="save"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
			<MkButton v-if="pageId" inline class="button" :wait="duplicating" :disabled="busy" @click="duplicate"><i class="ti ti-copy"></i> {{ i18n.ts.duplicate }}</MkButton>
			<MkButton v-if="pageId && !readonly" inline class="button" danger :wait="deleting" :disabled="busy" @click="del"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
		</div>

		<div v-if="tab === 'settings'">
			<div class="_gaps_m">
				<MkInput v-model="title">
					<template #label>{{ i18n.ts._pages.title }}</template>
				</MkInput>

				<MkInput v-model="summary">
					<template #label>{{ i18n.ts._pages.summary }}</template>
				</MkInput>

				<MkInput v-model="name">
					<template #prefix>{{ url }}/@{{ author?.username ?? '???' }}/pages/</template>
					<template #label>{{ i18n.ts._pages.url }}</template>
				</MkInput>

				<MkSwitch v-model="alignCenter">{{ i18n.ts._pages.alignCenter }}</MkSwitch>

				<MkSelect v-model="font" :items="fontDef">
					<template #label>{{ i18n.ts._pages.font }}</template>
				</MkSelect>

				<MkSwitch v-model="hideTitleWhenPinned">{{ i18n.ts._pages.hideTitleWhenPinned }}</MkSwitch>

				<div class="eyeCatch">
					<MkButton v-if="eyeCatchingImageId == null && !readonly" @click="setEyeCatchingImage"><i class="ti ti-plus"></i> {{ i18n.ts._pages.eyeCatchingImageSet }}</MkButton>
					<div v-else-if="eyeCatchingImage">
						<img :src="eyeCatchingImage.url" :alt="eyeCatchingImage.name" style="max-width: 100%;"/>
						<MkButton v-if="!readonly" @click="removeEyeCatchingImage()"><i class="ti ti-trash"></i> {{ i18n.ts._pages.eyeCatchingImageRemove }}</MkButton>
					</div>
					<div v-else-if="eyeCatchingImageError" class="_gaps_s">
						<!-- 取得できない画像も外せるよう、削除ボタンを残す -->
						<MkError :title="eyeCatchingImageError.guidance.title" :text="eyeCatchingImageError.guidance.text" @retry="refetchEyeCatchingImage()"/>
						<MkButton v-if="!readonly" @click="removeEyeCatchingImage()"><i class="ti ti-trash"></i> {{ i18n.ts._pages.eyeCatchingImageRemove }}</MkButton>
					</div>
					<MkLoading v-else-if="eyeCatchingImageId != null"/>
				</div>
			</div>
		</div>

		<div v-else-if="tab === 'contents'">
			<div :class="$style.contents">
				<XBlocks v-model="content" class="content"/>

				<MkButton v-if="!readonly" rounded class="add" @click="add()"><i class="ti ti-plus"></i></MkButton>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, provide, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import XBlocks from './page-editor.blocks.vue';
import { genId } from '@/utility/id.js';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { selectFile } from '@/utility/drive.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { $i } from '@/i.js';
import { mainRouter } from '@/router.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import { useApiAction } from '@/composables/use-api-action.js';
import { useApiQuery } from '@/composables/use-api-query.js';
import { getPageBlockList } from '@/pages/page-editor/common.js';

const props = defineProps<{
	initPageId?: string;
	initPageName?: string;
	initUser?: string;
}>();

const tab = ref('settings');
const author = ref<Misskey.entities.User | null>($i);
const readonly = ref(false);
const page = ref<Misskey.entities.Page | null>(null);
const pageId = ref<string | null>(null);
const currentName = ref<string | null>(null);
const title = ref('');
const summary = ref<string | null>(null);
const name = ref(Date.now().toString());
const eyeCatchingImageId = ref<string | null>(null);
const {
	model: font,
	def: fontDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._pages.fontSansSerif, value: 'sans-serif' },
		{ label: i18n.ts._pages.fontSerif, value: 'serif' },
	],
	initialValue: 'sans-serif',
});
const content = ref<Misskey.entities.Page['content']>([]);
const alignCenter = ref(false);
const hideTitleWhenPinned = ref(false);

provide('readonly', readonly.value);

const { data: eyeCatchingImage, error: eyeCatchingImageError, refetch: refetchEyeCatchingImage } = useApiQuery('drive/files/show', {
	// enabled が偽の間は params の結果を使わないため、null を除いてよい
	params: () => ({ fileId: eyeCatchingImageId.value! }),
	enabled: () => eyeCatchingImageId.value != null,
});

// 実行中のボタンに待機状態を表示し、いずれかの操作の実行中は操作ボタンを無効にする。
// ページを離れた後に表示を更新したり引き戻したりしないよう、成功後の反映と遷移は scope の破棄時に抑止される onSuccess で行う。
const { execute: createPage, isPending: creating } = useApiAction('pages/create', {
	onSuccess: (page, params) => {
		pageId.value = page.id;
		currentName.value = params.name;
		mainRouter.replace('/pages/edit/:initPageId', {
			params: {
				initPageId: page.id,
			},
		});
	},
});
const { execute: updatePage, isPending: updating } = useApiAction('pages/update', {
	onSuccess: (_, params) => {
		// name を送らなかった更新では、名前は変わっていない
		if (params.name != null) currentName.value = params.name;
		// 更新は成功しても画面が変わらないため、成功を示す
		os.success();
	},
});
// 失敗したときに題名と名前が書き換わったまま残らないよう、反映は成功してから行う
const { execute: duplicatePage, isPending: duplicating } = useApiAction('pages/create', {
	onSuccess: (page, params) => {
		title.value = params.title;
		name.value = params.name;
		pageId.value = page.id;
		currentName.value = params.name;
		mainRouter.push('/pages/edit/:initPageId', {
			params: {
				initPageId: page.id,
			},
		});
	},
});
const { execute: deletePage, isPending: deleting } = useApiAction('pages/delete', {
	onSuccess: () => {
		mainRouter.replace('/pages');
	},
});
const saving = computed(() => creating.value || updating.value);
const busy = computed(() => saving.value || duplicating.value || deleting.value);

function getSaveOptions(): Misskey.entities.PagesCreateRequest {
	return {
		title: title.value.trim(),
		name: name.value.trim(),
		summary: summary.value,
		font: font.value,
		script: '',
		hideTitleWhenPinned: hideTitleWhenPinned.value,
		alignCenter: alignCenter.value,
		content: content.value,
		variables: [],
		eyeCatchingImageId: eyeCatchingImageId.value,
	};
}

function save() {
	const options = getSaveOptions();

	if (pageId.value) {
		updatePage({
			pageId: pageId.value,
			...options,
		});
	} else {
		createPage(options);
	}
}

async function del() {
	if (!pageId.value) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.removeAreYouSure({ x: title.value.trim() }),
	});

	if (canceled) return;

	deletePage({
		pageId: pageId.value,
	});
}

function duplicate() {
	duplicatePage({
		...getSaveOptions(),
		title: (title.value + ' - copy').trim(),
		name: (name.value + '-copy').trim(),
	});
}

async function add() {
	const { canceled, result: type } = await os.select({
		title: i18n.ts._pages.chooseBlock,
		items: getPageBlockList(),
	});
	if (canceled || type == null) return;

	const id = genId();

	// TODO: page-editor.el.section.vueのと共通化
	if (type === 'text') {
		content.value.push({
			id,
			type,
			text: '',
		});
	} else if (type === 'section') {
		content.value.push({
			id,
			type,
			title: '',
			children: [],
		});
	} else if (type === 'image') {
		content.value.push({
			id,
			type,
			fileId: null,
		});
	} else if (type === 'note') {
		content.value.push({
			id,
			type,
			detailed: false,
			note: null,
		});
	}
}

function setEyeCatchingImage(ev: PointerEvent) {
	selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
	}).then(file => {
		eyeCatchingImageId.value = file.id;
	});
}

function removeEyeCatchingImage() {
	eyeCatchingImageId.value = null;
}

async function init() {
	if (props.initPageId) {
		page.value = await misskeyApi('pages/show', {
			pageId: props.initPageId,
		});
	} else if (props.initPageName && props.initUser) {
		page.value = await misskeyApi('pages/show', {
			name: props.initPageName,
			username: props.initUser,
		});
		readonly.value = true;
	}

	if (page.value) {
		author.value = page.value.user;
		pageId.value = page.value.id;
		title.value = page.value.title;
		name.value = page.value.name;
		currentName.value = page.value.name;
		summary.value = page.value.summary;
		font.value = page.value.font;
		hideTitleWhenPinned.value = page.value.hideTitleWhenPinned;
		alignCenter.value = page.value.alignCenter;
		content.value = page.value.content;
		eyeCatchingImageId.value = page.value.eyeCatchingImageId;
	} else {
		const id = genId();
		content.value = [{
			id,
			type: 'text',
			text: 'Hello World!',
		}];
	}
}

init();

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'settings',
	title: i18n.ts._pages.pageSetting,
	icon: 'ti ti-settings',
}, {
	key: 'contents',
	title: i18n.ts._pages.contents,
	icon: 'ti ti-note',
}]);

definePage(() => ({
	title: props.initPageId ? i18n.ts._pages.editPage
	: props.initPageName && props.initUser ? i18n.ts._pages.readPage
	: i18n.ts._pages.newPage,
	icon: 'ti ti-pencil',
}));
</script>

<style lang="scss" module>
.contents {
	&:global {
		> .add {
			margin: 16px auto 0 auto;
		}
	}
}
</style>

<style lang="scss" scoped>
.jqqmcavi {
	margin-bottom: 16px;

	> .button {
		& + .button {
			margin-left: 8px;
		}
	}
}

.gwbmwxkm {
	position: relative;

	> header {
		> .title {
			z-index: 1;
			margin: 0;
			padding: 0 16px;
			line-height: 42px;
			font-size: 0.9em;
			font-weight: bold;
			box-shadow: 0 1px rgba(#000, 0.07);

			> i {
				margin-right: 6px;
			}

			&:empty {
				display: none;
			}
		}

		> .buttons {
			position: absolute;
			z-index: 2;
			top: 0;
			right: 0;

			> button {
				padding: 0;
				width: 42px;
				font-size: 0.9em;
				line-height: 42px;
			}
		}
	}

	> section {
		padding: 0 32px 32px 32px;

		@media (max-width: 500px) {
			padding: 0 16px 16px 16px;
		}

		> .view {
			display: inline-block;
			margin: 16px 0 0 0;
			font-size: 14px;
		}

		> .content {
			margin-bottom: 16px;
		}

		> .eyeCatch {
			margin-bottom: 16px;

			> div {
				> img {
					max-width: 100%;
				}
			}
		}
	}
}

.qmuvgica {
	padding: 16px;

	> .variables {
		margin-bottom: 16px;
	}

	> .add {
		margin-bottom: 16px;
	}
}
</style>
