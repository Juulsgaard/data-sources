//<editor-fold desc="List Data">
import {FilterService} from "../filter.service";
import {ListFlagData} from "./table-data";
import {SimpleObject} from "@consensus-labs/ts-tools";
import {ThemeColor} from "../lib/types";

/**
 * The data structure used to render lists
 */
export interface ListData<TModel> {
    id: string;
    model: TModel;
    firstLine: string;
    secondLine?: string;
    avatar?: string;
    icon?: string;
    actions: ListActionConfig<TModel>[];
    flags: ListFlagData[];
    cssClasses: string[];
}

/**
 * A config for how to map to ListData
 */
export interface ListDataConfig<TItem> {
    firstLine: (data: TItem) => string;
    secondLine?: (data: TItem) => string;
    avatar?: (data: TItem) => string|undefined;
    avatarCacheBuster?: (data: TItem) => string|Date|undefined;
    avatarPlaceholder?: string;
    icon?: (data: TItem) => string;
    styles: {cssClass: string, condition: (data: TItem) => boolean}[];
}
//</editor-fold>

//<editor-fold desc="Grid Data">
/**
 * A data structure used to render list grids
 */
export interface GridData<TModel> {
    id: string;
    model: TModel;
    title: string;
    subTitle?: string;
    image?: string;
    icon?: string;
    index?: number;
    actions: ListActionConfig<TModel>[];
    flags: ListFlagData[];
}

/**
 * A config defining how to map to GridData
 */
export interface GridDataConfig<TItem> {
    title: (data: TItem) => string;
    subTitle?: (data: TItem) => string;
    image?: (data: TItem) => string|undefined;
    imageCacheBuster?: (data: TItem) => string|Date|undefined;
    imagePlaceholder?: string;
    icon?: (data: TItem) => string|undefined;
}
//</editor-fold>

//<editor-fold desc="Flags">
/**
 * A config for mapping List status flags
 */
export interface ListFlagConfig<TItem> {
    icon: string;
    name: string;
    filter: (data: TItem) => boolean
    inactiveIcon?: string;
}
//</editor-fold>

//<editor-fold desc="Item Actions">
/**
 * A config defining an action relating to a List Item
 */
export interface ListActionConfig<TModel> extends ListActionOptions<TModel> {
    name: string;
    icon: string;
    action: (data: TModel) => any;
}

/**
 * Optional configs for ListActionConfig
 */
export interface ListActionOptions<TModel> {
    filter?: (data: TModel) => boolean;
    color?: ThemeColor;
}
//</editor-fold>

/**
 * The base configuration for ListDataSource
 */
export interface ListDataSourceOptions<TModel> {
    paginated: boolean;
    pageSize: number;
    filterService?: FilterService<any, TModel>;
    actions: ListActionConfig<TModel>[];
    flags: ListFlagConfig<TModel>[];
    indexSorted: boolean;
    defaultSortOrder: 'asc'|'desc';
}

export interface ListUniversalData<TModel> {
    model: TModel;
    flags: ListFlagConfig<TModel>[];
    actions: ListActionConfig<TModel>[];
}

export interface ListSearchData<TModel> {
    model: TModel;
    search: SimpleObject;
}
