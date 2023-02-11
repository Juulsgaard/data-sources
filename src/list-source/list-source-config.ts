import {
  RenderDataTypes, RenderDataValueType, RenderValueDataType, SortingTypes, SortingValueType
} from "../models/render-types";
import {FilterService} from "../filtering/filter-service";
import {
  GridDataConfig, HiddenSearchColumn, HiddenSortColumn, ListActionOptions, ListDataConfig, ListDataSourceOptions,
  TableColumn, TableColumnOptions
} from "./list-data";
import {ListDataSource} from "./list-data-source";
import {getRenderDataTypeSorting, getSortingTypeSorting} from "../lib/sorting";
import {
  arrToObj, getSelectorFn, isString, KeysOfTypeOrNull, lowerFirst, MapFunc, SortFn, WithId
} from "@consensus-labs/ts-tools";


type TableColumnConfigs<TModel extends WithId> = {
  [key in keyof typeof RenderDataTypes as Uncapitalize<key>]: TableColumnConfig<TModel, RenderDataValueType<typeof RenderDataTypes[key]>|undefined>
};

type SortColumnConfigs<TModel extends WithId> = {
  [key in keyof typeof SortingTypes as Uncapitalize<key>]: SortColumnConfig<TModel, typeof SortingTypes[key]>
} & {model: SortModelConfig<TModel>};

//<editor-fold desc="Interfaces">
export interface IListDataSourceConfig<TModel extends WithId> {

  /** Define a table columns for the Table Rendering */
  table: TableColumnConfigs<TModel>;
  /** Define searchable data */
  search: SearchColumnConfig<TModel>;
  /** Define custom sorting for the data source */
  sort: SortColumnConfigs<TModel>;

  /**
   * Add List Rendering to the data source
   * @param firstLine - Define data for the first line in the List Rendering
   */
  addList(firstLine: (model: TModel) => string): ListConfig<TModel>;

  /**
   * Add Grind Rendering to the data source
   * @param title - Define data for the grid tile title in the List Rendering
   */
  addGrid(title: (model: TModel) => string): GridConfig<TModel>;

  /**
   * Define a flag for the items
   * Flags are optional icons that can be shown next to items
   * @param name - The name of the flag
   * @param icon - The icon used for rendering the flag
   * @param filter - A filter to determine if the flag should be shown
   * @param inactiveIcon - Define an icon for when the flag is not active
   */
  addFlag(name: string, icon: string, filter: (model: TModel) => boolean, inactiveIcon?: string): this;

  /**
   * Define an actions that can be performed for an item
   * @param name - The display name of the action
   * @param icon - The icon to show with the action
   * @param action - The action to perform
   * @param options - Options for configuring the action
   */
  addAction(name: string, icon: string, action: (data: TModel) => any, options?: ListActionOptions<TModel>): this;

  /**
   * Define a navigation that can be performed for an item
   * @param name - The display name of the action
   * @param icon - The icon to show with the action
   * @param route - Define the mapping for the route to use
   * @param options - Options for configuring the action
   */
  addNavigation(name: string, icon: string, route: (data: TModel) => string[], options?: ListActionOptions<TModel>): this;

  /**
   * Sort the list by an index property
   */
  hasIndexSorting(): this;

  /**
   * Add pagination to the data source
   * @param pageSize
   */
  withPagination(pageSize?: number): this;

  /**
   * Attach a filter service to the data source
   * @param service - The filter service
   */
  withFilterService(service: FilterService<any, TModel>): this;

  /**
   * Make the sorting default to descending order
   */
  defaultSortDesc(): this;

  /**
   * Finish the data source setup
   */
  finish(): ListDataSource<TModel>;
}
//</editor-fold>

//<editor-fold desc="Main Config">
export class ListDataSourceConfig<TModel extends WithId> implements IListDataSourceConfig<TModel> {

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
      ([_, type]) => new TableColumnConfig<TModel, any>(type, this),
    ) as TableColumnConfigs<TModel>;

    const sort = arrToObj(
      Object.entries(SortingTypes),
      ([key, _]) => lowerFirst(key),
      ([_, type]) => new SortColumnConfig<TModel, any>(type, this)
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

  addNavigation(name: string, icon: string, route: (data: TModel) => string[], options?: ListActionOptions<TModel>) {
    this.options.actions.push({
      name,
      icon,
      route,
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
class TableColumnConfig<TModel extends WithId, TData> {

  constructor(private type: RenderValueDataType<TData>, private config: ListDataSourceConfig<TModel>) { }

  /**
   * Define a column based on a property
   * @param key - The property to use
   * @param title - The column name
   * @param options - Column options
   */
  prop(key: KeysOfTypeOrNull<TModel, TData>, title: string, options?: TableColumnOptions<TModel, TData>) {
    const map = getSelectorFn(key);

    this.config.tableColumns.set(key.toString(), {
      id: key.toString(),
      title,
      mapData: map,
      dataType: this.type,
      sortFn: this.getSort(map, options),
      defaultSort: !!options?.defaultSort,
      searchable: !!options?.searchable,
      searchWeight: options?.searchWeight,
    } satisfies TableColumn<TModel, TData>);
    return this.config;
  }

  /**
   * Define a custom column based on a custom mopping
   * @param id - ID of the new column
   * @param title - The name of the column
   * @param map - Data mapping for the column
   * @param options - Column options
   */
  add(id: string, title: string, map: MapFunc<TModel, TData|undefined>, options?: TableColumnOptions<TModel, TData>) {
    this.config.tableColumns.set(id, {
      id,
      title,
      mapData: map,
      dataType: this.type,
      sortFn: this.getSort(map, options),
      defaultSort: !!options?.defaultSort,
      searchable: !!options?.searchable,
      searchWeight: options?.searchWeight
    } satisfies TableColumn<TModel, TData>);
    return this.config;
  }

  private getSort(map: MapFunc<TModel, TData|undefined>, options: TableColumnOptions<TModel, TData>|undefined): SortFn<TModel>|undefined {
    if (!options) return undefined;
    if (options.customSort) return options.customSort;
    if (!options.typeSort) return undefined;
    const sortFn = getRenderDataTypeSorting(this.type);
    if (!sortFn) return undefined;
    return (a, b) => sortFn(map(a), map(b));
  }
}

class SearchColumnConfig<TModel extends WithId> {

  constructor(private config: ListDataSourceConfig<TModel>) {
  }

  /**
   * Search based on an existing property
   * @param key - The property to use
   * @param weight - Optional search weighting
   */
  prop(key: KeysOfTypeOrNull<TModel, string>, weight?: number) {
    const map = getSelectorFn(key);
    this.config.searchColumns.set(key.toString(), {
      id: key.toString(),
      mapData: map,
      weight
    });
    return this.config;
  }

  /**
   * Define custom search data
   * @param id - ID of the data
   * @param map - Define the data mapping
   * @param weight - Optional search weighting
   */
  add(id: string, map: MapFunc<TModel, string|undefined>, weight?: number) {
    this.config.searchColumns.set(id, {
      id: id,
      mapData: map,
      weight
    });
    return this.config;
  }
}

class SortColumnConfig<TModel extends WithId, TSort extends SortingTypes> {

  private readonly baseSort: SortFn<SortingValueType<TSort>|undefined>;

  constructor(type: TSort, private config: ListDataSourceConfig<TModel>) {
    this.baseSort = getSortingTypeSorting(type);
  }

  /**
   * Add sorting based on an existing property
   * @param key - The property
   * @param title - The sorting name
   * @param defaultSort - Define if this should be the default sort
   */
  prop(key: KeysOfTypeOrNull<TModel, SortingValueType<TSort>>, title: string, defaultSort?: boolean) {
    const map = getSelectorFn(key);
    this.config.sortColumns.set(key.toString(), {
      id: key.toString(),
      title,
      sortFn: (a, b) => this.baseSort(map(a), map(b)),
      defaultSort: !!defaultSort
    } satisfies HiddenSortColumn<TModel, SortingValueType<TSort>>);
    return this.config;
  }

  /**
   * Define a custom sorting based on data mapping
   * @param id - The ID of the sort
   * @param map - The data used for the sorting
   * @param title - The name of the sort
   * @param defaultSort - Define if this should be the default sort
   */
  add(id: string, map: (model: TModel) => SortingValueType<TSort>|undefined, title: string, defaultSort?: boolean) {
    this.config.sortColumns.set(id, {
      id,
      title,
      sortFn: (a, b) => this.baseSort(map(a), map(b)),
      defaultSort: !!defaultSort
    } satisfies HiddenSortColumn<TModel, SortingValueType<TSort>>);
    return this.config;
  }
}

class SortModelConfig<TModel extends WithId> {

  constructor(private config: ListDataSourceConfig<TModel>) {
  }

  /**
   * Define the model sort
   * @param id - ID of the sort
   * @param title - The name of the sort
   * @param sort - The sorting method
   * @param defaultSort - Define if this should be the default sort
   */
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

  private listConfig: ListDataConfig<TModel>;

  constructor(private config: ListDataSourceConfig<TModel>) {
    this.listConfig = config.listConfig!;
  }

  /**
   * Add a second line to the List Rendering
   * @param secondLine
   */
  secondLine(secondLine: MapFunc<TModel, string|undefined>) {
    this.listConfig.secondLine = secondLine;
    return this;
  }

  /**
   * Add an image to the List Rendering
   * @param avatar - The url mapping
   * @param cacheBuster - An optional cache buster for the image
   */
  avatar(avatar: MapFunc<TModel, string|undefined>, cacheBuster?: MapFunc<TModel, string|Date|undefined>) {
    this.listConfig.avatar = avatar;
    this.listConfig.avatarCacheBuster = cacheBuster;
    return this;
  }

  /**
   * Define a placeholder for the list image if it can't be found
   * @param avatarPlaceholder - Fallback URL
   */
  avatarPlaceholder(avatarPlaceholder: string) {
    this.listConfig.avatarPlaceholder = avatarPlaceholder;
    return this;
  }

  /**
   * Add an icon to the List Rendering
   * @param icon
   */
  icon(icon: MapFunc<TModel, string|undefined>|string) {
    this.listConfig.icon = isString(icon) ? () => icon : icon;
    return this;
  }

  /**
   * Add custom styling to the List Rendering
   * @param cssClass - The CSS class to apply
   * @param condition - The condition for applying the style
   */
  style(cssClass: 'faded'|string, condition: (model: TModel) => boolean) {
    this.listConfig.styles.push({cssClass, condition});
    return this;
  }

  /**
   * Finish setting up List Rendering
   */
  finishList(): IListDataSourceConfig<TModel> {
    return this.config;
  }

  /**
   * Finish setting up the data source
   */
  finish() {
    return this.config.finish();
  }
}

//</editor-fold>

//<editor-fold desc="Grid Config">
class GridConfig<TModel extends WithId> {

  constructor(private config: ListDataSourceConfig<TModel>) {
  }

  /**
   * Add a sub-title to the Grid Rendering
   * @param subTitle
   */
  subTitle(subTitle: MapFunc<TModel, string|undefined>) {
    this.config.gridConfig!.subTitle = subTitle;
    return this;
  }

  /**
   * Add an image to the Grid Rendering
   * @param image - The url mapping
   * @param cacheBuster - An optional cache buster for the image
   */
  image(image: MapFunc<TModel, string|undefined>, cacheBuster?: MapFunc<TModel, string|Date|undefined>) {
    this.config.gridConfig!.image = image;
    this.config.gridConfig!.imageCacheBuster = cacheBuster;
    return this;
  }

  /**
   * Define a placeholder for the grid image if it can't be found
   * @param placeholder - Fallback URL
   */
  imagePlaceholder(placeholder: string) {
    this.config.gridConfig!.imagePlaceholder = placeholder;
    return this;
  }

  /**
   * Add an icon to the Grid Rendering
   * @param icon
   */
  icon(icon: MapFunc<TModel, string|undefined>|string) {
    this.config.gridConfig!.icon = isString(icon) ? () => icon : icon;
    return this;
  }

  /**
   * Finish setting up Grid Rendering
   */
  finishGrid(): IListDataSourceConfig<TModel> {
    return this.config;
  }

  /**
   * Finish setting up the data source
   */
  finish() {
    return this.config.finish();
  }
}

//</editor-fold>
