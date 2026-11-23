<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" data-testid="mkw-trends" class="mkw-trends">
	<template #icon><i class="ti ti-hash"></i></template>
	<template #header>{{ i18n.ts._widgets.trends }}</template>

	<div class="wbrkwala">
		<TransitionGroup v-if="stats" tag="div" :name="prefer.s.animation ? 'chart' : ''" class="tags">
			<div v-for="stat in stats" :key="stat.tag">
				<div class="tag">
					<MkA class="a" :to="`/tags/${ encodeURIComponent(stat.tag) }`" :title="stat.tag">#{{ stat.tag }}</MkA>
					<p>{{ i18n.tsx.nUsersMentioned({ n: stat.usersCount }) }}</p>
				</div>
				<MkMiniChart class="chart" :src="stat.chart"/>
			</div>
		</TransitionGroup>
		<div v-else-if="error" class="error">
			<MkError :title="error.guidance.title" :text="error.guidance.text" @retry="refetch()"/>
		</div>
		<MkLoading v-else/>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { useInterval } from '@@/js/use-interval.js';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/MkContainer.vue';
import MkMiniChart from '@/components/MkMiniChart.vue';
import { useApiGetQuery } from '@/composables/use-api-query.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const name = 'trends';

const widgetPropsDef = {
	showHeader: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.showHeader,
		default: true,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

// 同じ条件での取り直しは前の表示を残すので、定期更新のたびに読み込み中へ戻らない。
// 表示中の取り直しの失敗は出さず、前の表示を保って次の定期更新で取り直す。案内を出すのは表示できるデータがない初回の失敗だけ。
const { data: stats, error, refetch } = useApiGetQuery('hashtags/trend');

// 初回の取得は useApiGetQuery が作成時に行う
useInterval(refetch, 1000 * 60, {
	immediate: false,
	afterMounted: true,
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" scoped>
.wbrkwala {
	height: (62px + 1px) + (62px + 1px) + (62px + 1px) + (62px + 1px) + 62px;
	overflow: hidden;

	// 案内の本文が長いと固定の高さに収まらず、再試行ボタンが隠れるため
	> .error {
		height: 100%;
		overflow: auto;
	}

	> .tags {
		.chart-move {
			transition: transform 1s ease;
		}

		> div {
			display: flex;
			align-items: center;
			padding: 14px 16px;
			border-bottom: solid 0.5px var(--MI_THEME-divider);

			> .tag {
				flex: 1;
				overflow: hidden;
				font-size: 0.9em;
				color: var(--MI_THEME-fg);

				> .a {
					display: block;
					width: 100%;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
					line-height: 18px;
				}

				> p {
					margin: 0;
					font-size: 75%;
					opacity: 0.7;
					line-height: 16px;
				}
			}

			> .chart {
				height: 30px;
			}
		}
	}
}
</style>
