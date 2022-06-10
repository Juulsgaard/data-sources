import {RenderDataPrimaryTypes, RenderDataType, RenderDataTypeLookup, RenderDataTypes} from "../models/render-types";
import {FilterService} from "../filter.service";
import {GridDataConfig, ListActionOptions, ListDataConfig, ListDataSourceOptions} from "./list-data";
import {HiddenSearchColumn, HiddenSortColumn, TableColumn, TableColumnOptions} from "./table-data";
import {ListDataSource} from "./list-data-source";
import {getRenderDataTypeSorting} from "../lib/sorting";
import {arrToObj, getSelectorFn, KeysOfType, lowerFirst, SortFn, WithId} from "@consensus-labs/ts-tools";


type TableColumnConfigs<TModel extends WithId> = {
  [key in keyof typeof RenderDataTypes as Uncapitalize<key>]: TableColumnConfig<TModel, RenderDataTypeLookup<typeof RenderDataTypes[key]>>
};

type SortColumnConfigs<TModel extends WithId> = {
  [key in keyof typeof RenderDataTypes as Uncapitalize<key>]: SortColumnConfig<TModel, RenderDataTypeLookup<typeof RenderDataTypes[key]>>
} & {model: SortModelConfig<TModel>};

//<editor-fold desc="Main Config">
export class ListDataSourceConfig<TModel extends WithId> {

  tableColumns: Map<string, TableColumn<TModel, any>> = new Map<string, TableColumn<TModel, any>>();
  searchColumns: Map<string, HiddenSearchColumn<TModel>> = new Map<string, HiddenSearchColumn<TModel>>();
  sortColumns: Map<string, HiddenSortColumn<TModel, any>> = new Map<string, HiddenSortColumn<TModel, any>>();

  listConfig?: ListDataConfig<TModel>;
  gridConfig?: GridDataConfig<TModel>;
  options: ListDataSourceOptions<TModel> = {
    paginated: false,
    pageSize: 40,
    actions: [],
    indexSorted: false,
    flags: [],
    defaultSortOrder: 'asc'
  };

  table: TableColumnConfigs<TModel>;
  search: SearchColumnConfig<TModel>;
  sort: SortColumnConfigs<TModel>;

  constructor() {
    this.table = arrToObj(
      Object.entries(RenderDataTypes),
      ([key, _]) => lowerFirst(key),
      ([_, type]) => new TableColumnConfig<TModel, any>(type as RenderDataTypes, this),
    ) as TableColumnConfigs<TModel>;

    const sort = arrToObj(
      Object.entries(RenderDataTypes),
      ([key, _]) => lowerFirst(key),
      ([key, type]) => new SortColumnConfig<TModel, any>(type as RenderDataTypes, this)
    );

    this.sort = {...sort, model: new SortModelConfig(this)} as SortColumnConfigs<TModel>;

    this.search = new SearchColumnConfig<TModel>(this);
  }

  addList(firstLine: (model: TModel) => string) {
    this.listConfig = {firstLine, avatarPlaceholder: 'assets/placeholders/image.webp', styles: []};
    return new ListConfig(this);
  }

  addGrid(title: (model: TModel) => string) {
    this.gridConfig = {title, imagePlaceholder: 'assets/placeholders/image.webp'};
    return new GridConfig(this);
  }

  addFlag(name: string, icon: string, filter: (model: TModel) => boolean, inactiveIcon?: string) {
    this.options.flags.push({name, icon, filter, inactiveIcon});
    return this;
  }

  addAction(name: string, icon: string, action: (data: TModel) => any, options?: ListActionOptions<TModel>) {
    this.options.actions.push({
      name,
      icon,
      action,
      ...options
    });
    return this;
  }

  hasIndexSorting() {
    this.options.indexSorted = true;
    return this;
  }

  finish() {
    return new ListDataSource<TModel>(this.options, this.tableColumns, this.searchColumns, this.sortColumns, this.listConfig, this.gridConfig);
  }

  withPagination(pageSize?: number) {
    this.options.paginated = true;
    this.options.pageSize = pageSize ?? this.options.pageSize;
    return this;
  }

  withFilterService(service: FilterService<any, TModel>) {
    this.options.filterService = service;
    return this;
  }

  defaultSortDesc() {
    this.options.defaultSortOrder = 'desc';
    return this;
  }
}

//</editor-fold>

//<editor-fold desc="Column Config">
class TableColumnConfig<TModel extends WithId, TData extends RenderDataPrimaryTypes> {

  baseSort: SortFn<TData|undefined>;

  constructor(private type: RenderDataType<TData>, private config: ListDataSourceConfig<TModel>) {
    this.baseSort = getRenderDataTypeSorting(type);
  }

  prop(key: KeysOfType<TModel, TData | undefined>, title: string, options?: TableColumnOptions<TModel, TData>) {
    const map = getSelectorFn(key);
    this.config.tableColumns.set(key.toString(), {
      id: key.toString(),
      title,
      mapData: map,
      dataType: this.type,
      sortFn: options?.customSort ?? ((a, b) => this.baseSort(map(a), map(b))),
      defaultSort: !!options?.defaultSort,
      searchable: !!options?.searchable
    });
    return this.config;
  }

  add(id: string, title: string, map: (model: TModel) => TData, options?: TableColumnOptions<TModel, TData>) {
    this.config.tableColumns.set(id, {
      id,
      title,
      mapData: map,
      dataType: this.type,
      sortFn: options?.customSort ?? ((a, b) => this.baseSort(map(a), map(b))),
      defaultSort: !!options?.defaultSort,
      searchable: !!options?.searchable
    });
    return this.config;
  }
}

class SearchColumnConfig<TModel extends WithId> {

  constructor(private config: ListDataSourceConfig<TModel>) {
  }

  prop(key: KeysOfType<TModel, string>) {
    const map = getSelectorFn(key);
    this.config.searchColumns.set(key.toString(), {
      id: key.toString(),
      mapData: map,
    });
    return this.config;
  }

  add(id: string, map: (model: TModel) => string) {
    this.config.searchColumns.set(id, {
      id: id,
      mapData: map,
    });
    return this.config;
  }
}

class SortColumnConfig<TModel extends WithId, TData extends RenderDataPrimaryTypes> {

  baseSort: SortFn<TData|undefined>;

  constructor(type: RenderDataType<TData>, private config: ListDataSourceConfig<TModel>) {
    this.baseSort = getRenderDataTypeSorting(type);
  }

  prop(key: KeysOfType<TModel, TData | undefined>, title: string, defaultSort?: boolean) {
    const map = getSelectorFn(key);
    this.config.sortColumns.set(key.toString(), {
      id: key.toString(),
      title,
      sortFn: (a, b) => this.baseSort(map(a), map(b)),
      defaultSort: !!defaultSort
    });
    return this.config;
  }

  add(id: string, map: (model: TModel) => TData, title: string, defaultSort?: boolean) {
    this.config.sortColumns.set(id, {
      id,
      title,
      sortFn: (a, b) => this.baseSort(map(a), map(b)),
      defaultSort: !!defaultSort
    });
    return this.config;
  }
}

class SortModelConfig<TModel extends WithId> {

  constructor(private config: ListDataSourceConfig<TModel>) {
  }

  add(id: string, title: string, sort: SortFn<TModel>, defaultSort?: boolean) {
    this.config.sortColumns.set(id, {
      id: id,
      title,
      sortFn: sort,
      defaultSort: !!defaultSort
    });
    return this.config;
  }
}

//</editor-fold>

//<editor-fold desc="List Config">
class ListConfig<TModel extends WithId> {

  constructor(private config: ListDataSourceConfig<TModel>) {
  }

  secondLine(secondLine: (model: TModel) => string) {
    this.config.listConfig!.secondLine = secondLine;
    return this;
  }

  avatar(avatar: (model: TModel) => string|undefined, cacheBuster?: (data: TModel) => string|Date|undefined) {
    this.config.listConfig!.avatar = avatar;
    this.config.listConfig!.avatarCacheBuster = cacheBuster;
    return this;
  }

  avatarPlaceholder(avatarPlaceholder: string) {
    this.config.listConfig!.avatarPlaceholder = avatarPlaceholder;
    return this;
  }

  icon(icon: (model: TModel) => string) {
    this.config.listConfig!.icon = icon;
    return this;
  }

  style(cssClass: 'faded'|string, condition: (model: TModel) => boolean) {
    this.config.listConfig!.styles.push({cssClass, condition});
    return this;
  }

  finishList() {
    return this.config;
  }

  finish() {
    return this.config.finish();
  }
}

//</editor-fold>

//<editor-fold desc="Grid Config">
class GridConfig<TModel extends WithId> {

  constructor(private config: ListDataSourceConfig<TModel>) {
  }

  subTitle(subTitle: (model: TModel) => string) {
    this.config.gridConfig!.subTitle = subTitle;
    return this;
  }

  image(image: (model: TModel) => string | undefined, cacheBuster?: (data: TModel) => string|Date|undefined) {
    this.config.gridConfig!.image = image;
    this.config.gridConfig!.imageCacheBuster = cacheBuster;
    return this;
  }

  imagePlaceholder(placeholder: string) {
    this.config.gridConfig!.imagePlaceholder = placeholder;
    return this;
  }

  icon(icon: (model: TModel) => string | undefined) {
    this.config.gridConfig!.icon = icon;
    return this;
  }

  finishGrid() {
    return this.config;
  }

  finish() {
    return this.config.finish();
  }
}

//</editor-fold>
