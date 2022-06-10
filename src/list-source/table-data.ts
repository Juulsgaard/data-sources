import {ListActionConfig} from "./list-data";
import {SimpleObject, SortFn} from "../lib/types";
import {RenderDataType} from "../models/render-types";

//<editor-fold desc="Column Data">

export interface TableColumn<TItem, TData> {
    id: string;
    title: string;
    mapData: (data: TItem) => TData;
    dataType: RenderDataType<TData>;
    sortFn?: SortFn<TItem>;
    defaultSort: boolean;
    searchable: boolean;
}

export interface TableColumnOptions<TModel, TData> {
    typeSort?: boolean;
    customSort?: (a: TModel, b: TModel) => number;
    defaultSort?: boolean;
    searchable?: boolean;
}

export interface HiddenSearchColumn<TModel> {
    id: string;
    mapData: (model: TModel) => string
}

export interface HiddenSortColumn<TModel, TData> {
    id: string;
    title: string;
    sortFn: SortFn<TModel>;
    defaultSort: boolean;
}
//</editor-fold>

export interface TableData<TModel> {
    id: string;
    model: TModel;
    data: SimpleObject;
    actions: ListActionConfig<TModel>[];
    flags: ListFlagData[];
}

export interface ListFlagData {
    icon: string;
    name: string;
}
