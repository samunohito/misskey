/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Component, ComputedRef, Ref } from 'vue';
import { GridCellValidator } from '@/components/grid/cell-validators.js';
import { Size, SizeStyle } from '@/components/grid/grid.js';
import { calcCellWidth } from '@/components/grid/grid-utils.js';
import { CellValue, GridCell } from '@/components/grid/cell.js';
import { GridRow } from '@/components/grid/row.js';
import { MenuItem } from '@/types/menu.js';
import { GridContext } from '@/components/grid/grid-event.js';

export type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'image' | 'hidden' | 'custom';

export type CustomValueEditor = (row: GridRow, col: GridColumn, value: CellValue, cellElement: HTMLElement) => Promise<CellValue>;
export type CellValueTransformer = (row: GridRow, col: GridColumn, value: CellValue) => CellValue;
export type GridColumnContextMenuFactory = (col: GridColumn, context: GridContext) => MenuItem[];

/**
 * カスタムセルテンプレートを設定するための型.カスタムセルテンプレートを使用する場合、`type`に`custom`を設定する.
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
 */
export type CustomCellTemplate = {
	/**
	 * セルに埋め込むコンポーネントの名称またはコンポーネントそのものを返す関数を設定する.
	 * 名称を設定する場合、対象のコンポーネントがグローバルコンポーネントとして登録されている必要がある.
	 *
	 * なお、ここで設定したコンポーネントには`cell`というprop名で{@link GridCell}型のオブジェクトがbindされる.
	 * そのほかのパラメータが必要な場合、{@link extraParams}経由で設定可能.
	 */
	template: () => string | Component;
	/**
	 * セルに埋め込むコンポーネントにbindする外部パラメータを返す関数を設定する.
	 */
	extraParams?: (cell: GridCell) => Record<string, any>;
	events?: {
		cellEditing?: (cell: GridCell, context: CustomCellTemplateContext) => void;
	};
};

export type CustomCellTemplateContext = {
	operation: {
		/**
		 * セルを編集状態にする.
		 * セルの外がクリックされるなどすると自動的に編集状態は解除される.
		 */
		beginEdit: () => void;
		/**
		 * セルの編集状態を解除する.
		 * @param applyValue 編集中の値を適用するかどうか
		 * @param newValue applyValueがtrueの場合、適用する値
		 */
		endEdit: (applyValue: boolean, newValue: CellValue) => void;
	}
}

export type GridColumnSetting = {
	bindTo: string;
	title?: string;
	icon?: string;
	type: ColumnType;
	width: SizeStyle;
	editable?: boolean;
	validators?: GridCellValidator[];
	customValueEditor?: CustomValueEditor;
	customTemplate?: CustomCellTemplate,
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

