import {IFilterService} from "../filtering/filter-service";
import {ThemeColor} from "../lib/types";
import {MapFunc, SortFn} from "@juulsgaard/ts-tools";
import {RenderValueDataType, SortableValueTypes} from "../models/render-types";

//<editor-fold desc="Column Data">

export interface TableColumn<TItem, TData> {
    id: string;
    title: string;
    mapData: (data: TItem) => TData|undefined;
    dataType: RenderValueDataType<TData>;
    sortFn?: SortFn<TItem>;
    defaultSort: boolean;
    searchable: boolean;
    searchWeight?: number;
}

export interface TableColumnOptions<TModel, TData> {
    /** Sort the column with a default algorithm based on the data type */
    typeSort?: TData extends SortableValueTypes ? boolean : false;
    /** Define a custom sorting method for the column */
    customSort?: SortFn<TModel>;
    /** Mark this column as the default used for sorting */
    defaultSort?: boolean;
    /** Include this column in the search index */
    searchable?: boolean;
    /** Add a custom weighting to this column in the search index */
    searchWeight?: number;
}

export interface HiddenSearchColumn<TModel> {
    id: string;
    mapData: (model: TModel) => string|undefined;
    weight?: number;
}

export interface HiddenSortColumn<TModel, TData> {
    id: string;
    title: string;
    sortFn: SortFn<TModel>;
    defaultSort: boolean;
}
//</editor-fold>

//<editor-fold desc="List Data">
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
    actions: ListAction<TModel>[];
    flags: ListFlag[];
    cssClasses: string[];
}

/**
 * A config for how to map to ListData
 */
export interface ListDataConfig<TItem> {
    firstLine: (data: TItem) => string;
    secondLine?: MapFunc<TItem, string|undefined>;
    avatar?: (data: TItem) => string|undefined;
    avatarCacheBuster?: (data: TItem) => string|Date|undefined;
    avatarPlaceholder?: string;
    icon?: MapFunc<TItem, string|undefined>;
}
//</editor-fold>

//<editor-fold desc="Table Data">
export interface TableData<TModel> {
    id: string;
    model: TModel;
    data: Record<string, any|undefined>;
    actions: ListAction<TModel>[];
    flags: ListFlag[];
    cssClasses: string[];
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
    actions: ListAction<TModel>[];
    flags: ListFlag[];
    cssClasses: string[];
}

/**
 * A config defining how to map to GridData
 */
export interface GridDataConfig<TItem> {
    title: (data: TItem) => string;
    subTitle?: (data: TItem) => string|undefined;
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
    inactiveName?: string;
}

export interface ListFlag {
    icon: string;
    name: string;
}
//</editor-fold>

//<editor-fold desc="Item Actions">
/**
 * A config defining an action relating to a List Item
 */
export interface ListActionConfig<TModel> extends ListNavigationOptions<TModel> {
    name: string;
    icon: string;
    action?: (data: TModel) => any;
    route?: (data: TModel) => string[];
}

export interface ListAction<TModel> {
    name: string;
    icon: string;
    color?: ThemeColor;
    action?: (data: TModel) => any;
    newTab?: boolean;
    route?: string[];
}

/**
 * Optional configs for ListActionConfig
 */
export interface ListActionOptions<TModel> {
    /** A filter to determine when the action should be visible */
    filter?: (data: TModel) => boolean;
    /** An optional color for the button */
    color?: ThemeColor;
}

/**
 * Optional configs for ListNavigationConfig
 */
export interface ListNavigationOptions<TModel> extends ListActionOptions<TModel> {
    newTab?: boolean;
}
//</editor-fold>

/**
 * The base configuration for ListDataSource
 */
export interface ListDataSourceOptions<TModel> {
    paginated: boolean;
    pageSize: number;
    filterService?: IFilterService<TModel>;
    actions: ListActionConfig<TModel>[];
    flags: ListFlagConfig<TModel>[];
    cssClasses: {cssClass: string, condition: (data: TModel) => boolean}[];
    indexSorted: boolean;
    defaultSortOrder: 'asc'|'desc';
}

export interface ListUniversalData<TModel> {
    model: TModel;
    flags: ListFlag[];
    actions: ListAction<TModel>[];
    cssClasses: string[];
}

export interface ListSearchData<TModel> {
    model: TModel;
    search: Record<string, string|undefined>;
}
