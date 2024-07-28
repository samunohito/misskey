/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Component } from 'vue';
import { GridCellValidator } from '@/components/grid/cell-validators.js';
import { Size, SizeStyle, TextAlignStyle } from '@/components/grid/grid.js';
import { calcCellWidth } from '@/components/grid/grid-utils.js';
import { CellValue, GridCell } from '@/components/grid/cell.js';
import { GridRow } from '@/components/grid/row.js';
import { MenuItem } from '@/types/menu.js';
import { GridContext } from '@/components/grid/grid-event.js';
import { ComponentEmit } from '@/os.js';

export type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'image' | 'hidden' | 'custom';

export type CustomValueEditor = (row: GridRow, col: GridColumn, value: CellValue, cellElement: HTMLElement) => Promise<CellValue>;
export type CellValueTransformer = (row: GridRow, col: GridColumn, value: CellValue) => CellValue;
export type GridColumnContextMenuFactory = (col: GridColumn, context: GridContext) => MenuItem[];

export type ExportParamsType<T extends Component> = T extends new () => { $props: infer Props }
	? Props extends object
		? 'extraParams' extends keyof Props
			? Props['extraParams']
			: never
		: never
	: never;

/**
 * カスタムセルテンプレートを設定するための型.カスタムセルテンプレートを使用する場合、`type`に`custom`を設定する.
 *
 * ## カスタムテンプレートにパラメータを渡す
 *
 * {@link template}に設定したコンポーネントには以下の値がそれぞれbindされる.
 * ```ts
 * const props = defineProps<{
 * 	cell: GridCell;
 * 	extraParams: T;
 * 	mounted: () => void;
 * }>();
 * ```
 * ※T…{@link extraParams}で設定した値
 *
 * mountedはコンポーネントがマウントされたら呼び出す必要がある.
 * セルの横幅を計算するためには、コンポーネントがマウントされた後に要素の横幅を取得する必要があるが、
 * セル側からだと埋め込まれたコンポーネントのマウントがいつ終わったのか検知出来ないため、この関数オブジェクトを通じて手動で通知する.
 *
 * ## カスタムテンプレートからイベントを受け取る
 *
 * カスタムテンプレートからemitされたイベントは、{@link extraEvents}に設定した関数オブジェクトを通じて受け取り可能.
 * emitのイベント名と{@link extraEvents}に設定した関数オブジェクトの名称は一致している必要がある.
 *
 * このように定義されたemit関数オブジェクトからの通知を受け取るには、以下のように記述する.
 * ```ts
 * // カスタムテンプレート側の記述
 * const emit = defineEmits<{
 * 	(ev: 'click', event: MouseEvent)
 * }>();
 *
 * // この定義側の記述
 * ```ts
 * extraEvents: () => ({
 * 	click: (event: MouseEvent) => console.log('click', event)
 * })
 * ```
 *
 * ## セルの編集モードへの対応
 *
 * 編集モードはテキストボックスをオーバーレイ表示するなど、セルの値を直接編集するためのUIが想定される.
 * カスタムテンプレート側でそれを実現するためには、セルが編集モードになったことを検知して表示の切り替えをなどの制御が必要になる.
 * 上記を実現するため、「編集モードになったこと」「編集モードを抜けたこと」をカスタムテンプレート側で知るための仕組みが用意されている.
 *
 * 具体的には以下の例のように、関数beginEditと関数endEditをそれぞれ実装し、defineExposeで公開すればよい.
 * これにより、セルが編集モードになる直前と編集モードを抜ける直前にそれぞれ呼び出される.
 *
 * ```ts
 * // 編集モードになる直前に呼び出される
 * function beginEdit(): boolean {
 * 	// falseを返すか、この関数が未実装だと編集モードにならない
 * 	return true;
 * }
 *
 * // 編集モード解除直前に呼び出される
 * function endEdit(): CellValue {
 * 	// この値がセルおよびグリッドにbindした値に書き込まれる
 * 	return '編集後の値';
 * }
 *
 * defineExpose({
 * 	beginEdit,
 * 	endEdit,
 * });
 * ```
 *
 * 関数名・シグネチャが異なると正しく動作しない可能性があるので、例の通りに実装する.
 *
 * @see createCustomCellTemplate
 */
export type CustomCellTemplate<T extends Component> = {
	/**
	 * セルに埋め込むコンポーネントを返す関数を設定する.
	 *
	 * なお、ここで設定したコンポーネントには`cell`というprop名で{@link GridCell}型のオブジェクトがbindされる.
	 * そのほかのパラメータが必要な場合、{@link extraParams}経由で設定可能.
	 */
	template: () => T;
	/**
	 * セル側から通知されるイベントを受け取るための関数オブジェクトを設定する
	 */
	events?: {
		// nop
	};
	/**
	 * セルに埋め込むコンポーネントにv-bindでbindする外部パラメータを返す関数を設定する.
	 */
	extraParams?: (cell: GridCell) => ExportParamsType<T>;
	/**
	 * セルに埋め込むコンポーネントにv-onでbindするイベントを設定する.
	 */
	extraEvents?: () => ComponentEmit<T>;
};

export function createCustomCellTemplate<T extends Component>(
	params: {
		template: () => T,
		events?: CustomCellTemplate<T>['events'],
		extraParams?: (cell: GridCell) => ExportParamsType<T>,
		extraEvents?: () => ComponentEmit<T>,
	},
): CustomCellTemplate<T> {
	return params;
}

export type GridColumnSetting = {
	bindTo: string;
	title?: string;
	icon?: string;
	type: ColumnType;
	width: SizeStyle;
	align?: TextAlignStyle;
	editable?: boolean;
	validators?: GridCellValidator[];
	// TODO: CustomCellTemplateに統合したい
	customValueEditor?: CustomValueEditor;
	customTemplate?: CustomCellTemplate<any>,
	valueTransformer?: CellValueTransformer;
	contextMenuFactory?: GridColumnContextMenuFactory;
	events?: {
		copy?: (value: CellValue) => string;
		paste?: (text: string) => CellValue;
		delete?: (cell: GridCell, context: GridContext) => void;
		dblclick?: (cell: GridCell) => void;
	},
};

export type GridColumn = {
	index: number;
	setting: GridColumnSetting;
	width: string;
	contentSize: Size;
}

export function createColumn(setting: GridColumnSetting, index: number): GridColumn {
	return {
		index,
		setting,
		width: calcCellWidth(setting.width),
		contentSize: { width: 0, height: 0 },
	};
}

