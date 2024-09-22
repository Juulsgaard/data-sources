import {BehaviorSubject, EMPTY, Observable, of} from "rxjs";
import {catchError, switchMap} from "rxjs/operators";
import Fuse from "fuse.js";
import {IFilterServiceState} from "../filtering/filter-service";
import {
  GridData, GridDataConfig, HiddenSearchColumn, HiddenSortColumn, ListAction, ListActionConfig, ListData,
  ListDataConfig, ListDataSourceOptions, ListFlag, ListSearchData, ListUniversalData, TableColumn, TableData
} from "./list-data";
import {ISorted, sortByIndexAsc} from "../lib/index-sort";
import {DetachedSearchData} from "../models/detached-search";
import {
  applyQueryParam, arrToMap, isNumber, mapArrNotNull, mapToArr, SimpleObject, SortFn, WithId
} from "@juulsgaard/ts-tools";
import {Page, Sort} from "../lib/types";
import {
  assertInInjectionContext, computed, DestroyRef, effect, inject, Injector, signal, Signal, untracked
} from "@angular/core";
import {takeUntilDestroyed, toObservable} from "@angular/core/rxjs-interop";
import {searchSignal} from "../lib/signals";

interface Outputs<T> {
  simple: Signal<ListUniversalData<T>[]>;
  table: Signal<TableData<T>[]>;
  list: Signal<ListData<T>[]>;
  grid: Signal<GridData<T>[]>;
}

export class ListDataSource<TModel extends WithId> {

  public readonly columnIds: string[];
  public readonly columns: TableColumn<TModel, any>[];

  public readonly sortOptions: SortOption[];
  private readonly sortLookup: Map<string, SortFn<TModel>>;
  private readonly searchKeys: {weight?: number, key: string}[] = [];

  public readonly paginated: boolean;
  public readonly indexSorted: boolean;

  public readonly gridFallbackImage?: string;
  public readonly listFallbackImage?: string;

  //<editor-fold desc="Outputs">
  public readonly data: Outputs<TModel>;
  public readonly displayData: Outputs<TModel>;
  public readonly searchData: Outputs<TModel>;
  //</editor-fold>

  private readonly onDestroy: DestroyRef;

  constructor(
    private readonly options: ListDataSourceOptions<TModel>,
    private readonly tableColumns: Map<string, TableColumn<TModel, any>>,
    private readonly searchColumns: Map<string, HiddenSearchColumn<TModel>>,
    private readonly sortColumns: Map<string, HiddenSortColumn<TModel, any>>,
    private readonly listConfig?: ListDataConfig<TModel>,
    private readonly gridConfig?: GridDataConfig<TModel>,
    private readonly injector?: Injector
  ) {

    if (!this.injector) assertInInjectionContext(ListDataSource);

    this.onDestroy = this.injector?.get(DestroyRef) ?? inject(DestroyRef);

    this.columns = mapToArr(tableColumns);

    this.paginated = options.paginated;
    this.indexSorted = options.indexSorted;

    this.listFallbackImage = listConfig?.avatarPlaceholder;
    this.gridFallbackImage = gridConfig?.imagePlaceholder;

    //<editor-fold desc="Initialise">
    this.sortOptions = [];
    this.columnIds = [];
    this.sortLookup = new Map<string, SortFn<TModel>>();

    for (let [id, col] of sortColumns) {
      this.sortOptions.push({id, name: col.title});
      this.sortLookup.set(id, col.sortFn);

      if (col.defaultSort) {
        this._sorting.set({direction: options.defaultSortOrder, active: id});
      }
    }

    for (let [id, col] of searchColumns) {
      this.searchKeys.push({key: id, weight: col.weight});
    }

    for (let [id, col] of tableColumns) {
      this.columnIds.push(col.id);

      if (col.sortFn) {
        this.sortOptions.push({id: col.id, name: col.title});
        this.sortLookup.set(col.id, col.sortFn);
      }

      if (col.defaultSort) {
        this._sorting.set({direction: options.defaultSortOrder, active: col.id});
      }

      if (col.searchable) {
        this.searchKeys.push({key: id, weight: col.searchWeight});
      }
    }

    if (this.options.actions.length) {
      this.columnIds.push('_actions');
    }

    if (this.options.flags.length) {
      this.columnIds.push('_flags');
    }

    this.filterState = this.options.filterService?.filter ?? signal(undefined)
    //</editor-fold>

    //<editor-fold desc="Setup Pipeline">

    // Filtering
    this.filteredItems = computed(() => this.filterItems(this.items()));

    const filterActive = computed(() => {
      const activeCount = this.options.filterService?.activeFilters() ?? 0;
      return activeCount > 0;
    });

    this.filterActive = computed(() => this.blacklist().length > 0 || filterActive());

    //Search Query
    const query = searchSignal(this.searchQuery, 1000, 300, {injector: this.injector});
    this.searching = computed(() => !!query()?.length);

    // Setup Search
    this.preSearchData = computed(() => this.mapToSearch(this.filteredItems()));
    this.searcher = computed(() => this.getSearcher(this.preSearchData()));

    // Search
    const searchData = computed(() => this.search(query()));

    // Search output
    const universalSearchData = computed(() => this.mapToUniversal(searchData()));

    this.searchData = {
      simple: universalSearchData,
      table: computed(() => this.mapToTable(universalSearchData())),
      grid: computed(() => this.mapToGrid(universalSearchData())),
      list: computed(() => this.mapToList(universalSearchData())),
    };

    // Sorting
    this.processedItems = computed(() => this.sortItems(this.filteredItems()));

    // Pagination
    // Update page number if out of bounds
    effect(() => this.updatePage(), {allowSignalWrites: true, injector: this.injector});

    this.paginatedItems = computed(() => this.paginate(this.processedItems()));

    // Outputs

    const universalData = computed(() => this.mapToUniversal(this.processedItems()));

    this.data = {
      simple: universalData,
      table: computed(() => this.mapToTable(universalData())),
      grid: computed(() => this.mapToGrid(universalData())),
      list: computed(() => this.mapToList(universalData())),
    };

    this.displayData = {
      simple: computed(() => this.searching() ? this.searchData.simple() : this.data.simple()),
      table: computed(() => this.searching() ? this.searchData.table() : this.data.table()),
      grid: computed(() => this.searching() ? this.searchData.grid() : this.data.grid()),
      list: computed(() => this.searching() ? this.searchData.list() : this.data.list()),
    };
    //</editor-fold>

    // Map observable items to item signal
    this.itemSources$.pipe(
      switchMap(x => x ?? EMPTY),
      takeUntilDestroyed(this.onDestroy),
      catchError(() => of([] as TModel[]))
    ).subscribe(val => this.setItems(val));
  }

  //<editor-fold desc="Item Population">
  private readonly _items = signal<TModel[]>([]);
  private readonly itemSources$ = new BehaviorSubject<Observable<TModel[]>|undefined>(undefined);

  public readonly items: Signal<TModel[]> = this._items.asReadonly();
  public readonly items$: Observable<TModel[]> = toObservable(this._items);

  public readonly length = computed(() => this.items().length);
  public readonly filteredLength = computed(() => this.filteredItems().length);

  public readonly empty: Signal<boolean> = computed(() => this.length() <= 0);
  public readonly itemLookup: Signal<Map<string, TModel>> = computed(() => arrToMap(this.items(), x => x.id));

  /** A list of models after filtering **/
  public readonly filteredItems: Signal<TModel[]>;

  /** A list of models after filtering and sorting **/
  public readonly processedItems: Signal<TModel[]>;

  /** A list of models after filtering, sorting and pagination **/
  public readonly paginatedItems: Signal<TModel[]>;


  /**
   * Populate the data source
   * @param items
   */
  setItems(items: TModel[]) {
    this._items.set(items);
  }

  /**
   * Populate the data source via observable
   * @param items$
   */
  setItems$(items$: Observable<TModel[]>|undefined) {
    this.itemSources$.next(items$);
  }

  /**
   * Trigger a re-calculation of the data source pipeline
   */
  recalculate() {
    this.setItems([...untracked(this.items)]);
  }

  //</editor-fold>

  //<editor-fold desc="Filtering">
  private readonly filterState: Signal<IFilterServiceState<TModel> | undefined>;
  public readonly filterActive: Signal<boolean>;

  private blacklist = signal<string[]>([]);

  /**
   * Define a list of Ids that will be removed from the final result
   * @param ids
   */
  setBlacklist(ids: string[] | undefined) {
    this.blacklist.set(ids ?? []);
  }

  /**
   * Apply the blacklist / service filter in the pipeline
   * @param list - The data
   * @private
   */
  private filterItems(list: TModel[]): TModel[] {
    if (list.length <= 0) return list;

    const blacklist = this.blacklist();

    if (blacklist?.length) {
      const set = new Set<string>(blacklist);
      list = list.filter(x => !set.has(x.id));
    }

    const filter = this.filterState();

    if (!filter) return list;
    return filter.filter(list);
  }

  //</editor-fold>

  //<editor-fold desc="Map To Universal">
  mapToUniversal(list: TModel[]): ListUniversalData<TModel>[] {
    return list.map(item => {
      const actions = mapArrNotNull(this.options.actions, action => this.mapAction(item, action));

      const flags = mapArrNotNull(this.options.flags, f => {
        const active = f.filter(item);
        const icon = active ? f.icon : f.inactiveIcon;
        const name = active ? f.name : f.inactiveName ?? f.name;
        return icon ? {icon, name} as ListFlag : null;
      });

      const cssClasses = this.options.cssClasses
        .filter(style => style.condition(item))
        .map(x => x.cssClass)

      return {model: item, actions, flags, cssClasses};
    });
  }
  //</editor-fold>

  //<editor-fold desc="Map to Table">
  /**
   * Map the raw data to a table format with data as defined by the config
   * @param list - The raw data
   * @private
   */
  private mapToTable(list: ListUniversalData<TModel>[]): TableData<TModel>[] {
    return list.map(item => {
      const data = {} as SimpleObject;
      this.tableColumns.forEach(col => {
        data[col.id] = col.mapData(item.model);
      });

      return {
        ...item,
        id: item.model.id,
        data
      };
    })
  }

  //</editor-fold>

  //<editor-fold desc="Search">
  readonly searchQuery = signal<string|undefined>(undefined);
  private readonly preSearchData: Signal<ListSearchData<TModel>[]>;
  private _searcher?: Fuse<ListSearchData<TModel>>;
  private readonly searcher: Signal<Fuse<ListSearchData<TModel>>>;
  private searchResultLimit = 200;

  readonly searching: Signal<boolean>;

  /**
   * Add a search map to model
   * @param list - data models
   */
  mapToSearch(list: TModel[]): ListSearchData<TModel>[] {
    return list.map(item => {
      const search: Record<string, string> = {};

      for (let [id, col] of this.tableColumns) {
        if (!col.searchable) continue;
        const val = col.mapData(item)?.toString();
        if (val !== undefined) search[id] = val;
      }

      for (let [id, col] of this.searchColumns) {
        const val = col.mapData(item);
        if (val !== undefined) search[id] = val;
      }

      return {model: item, search};
    });
  }

  /**
   * Prepare the search algorithms
   * @param list
   * @private
   */
  private getSearcher(list: ListSearchData<TModel>[]): Fuse<ListSearchData<TModel>> {

    if (this._searcher) {
      this._searcher.setCollection(list);
      return this._searcher;
    }

    this._searcher = new Fuse<ListSearchData<TModel>>(list, {
      includeScore: true,
      shouldSort: true,
      keys: this.searchKeys.map(({key, weight}) => ({
        name: ['search', key],
        weight: weight ?? 1
      }))
    });

    return this._searcher;
  }

  /**
   * Apply the search algorithms
   * @param query
   * @param limit
   * @private
   */
  private search(query: string|undefined, limit?: number): TModel[] {
    if (!query) return this.preSearchData().map(x => x.model);
    const result = this.searcher().search(query ?? '', {limit: limit ?? this.searchResultLimit});
    return result.map(x => x.item.model);
  }

  //</editor-fold>

  //<editor-fold desc="Detached Search">

  /**
   * Generate a detached search feed with a dedicated query
   * @param searchQuery - The dedicated query (should be throttled if coming from user input)
   * @param limit - Limit the amount of search results
   */
  getDetachedSearch(searchQuery: Signal<string>, limit = 20): Signal<DetachedSearchData<TModel>[]> {

    if (!this.listConfig) {
      if (!this.gridConfig) {
        throw Error('Page Search requires either a List or Grid Config');
      }
    }

    const getName = this.listConfig
      ? (item: TModel) => this.listConfig!.firstLine(item)
      : (item: TModel) => this.gridConfig!.title(item);

    const getIcon = this.listConfig
      ? (item: TModel) => this.listConfig!.icon?.(item)
      : (item: TModel) => this.gridConfig!.icon?.(item);

    const getExtra = this.listConfig
      ? (item: TModel) => this.listConfig!.secondLine?.(item)
      : (item: TModel) => this.gridConfig!.subTitle?.(item);

    return computed(() => {

      const query = searchQuery();
      if (!query) return [];

      const result = this.searcher().search(query ?? '', {limit});
      return result.map(x => ({
        id: x.item.model.id,
        model: x.item.model,
        name: getName(x.item.model),
        icon: getIcon(x.item.model),
        extra: getExtra(x.item.model),
        score: x.score ?? 0,
      } satisfies DetachedSearchData<TModel>));
    });
  }

  //</editor-fold>

  //<editor-fold desc="Sorting">
  private static readonly defaultSorting: Sort = {active: '', direction: 'asc'};
  private readonly _sorting = signal(ListDataSource.defaultSorting);
  private readonly sorting = this._sorting.asReadonly();

  /**
   * Sort the data according to the index
   * (Only applies to ISorted lists)
   * @param list
   * @private
   */
  private indexSort(list: TModel[]) {
    if (!this.options.indexSorted) return list;
    return ([...list] as (TModel & ISorted)[]).sort(sortByIndexAsc);
  }

  /**
   * Apply the selected sorting
   * If no sorting is supplied then the list is returned as is
   * @param list
   * @private
   */
  private sortItems(list: TModel[]): TModel[] {

    const sort = this.sorting();
    if (!sort.active?.length || !sort.direction.length) return this.indexSort(list);

    const sortFn = this.sortLookup.get(sort.active);
    if (!sortFn) return this.indexSort(list);

    return [...list].sort(sort.direction == 'asc' ? sortFn : (a, b) => -1 * sortFn(a, b));
  }

  /**
   * Change the active sorting, or remove sorting
   * @param sort
   */
  setSort(sort?: Sort) {
    this._sorting.set(sort ?? ListDataSource.defaultSorting);
  }

  //</editor-fold>

  //<editor-fold desc="Map to List">
  /**
   * Map the table data to the more compact List data
   * @param list - Row data
   * @private
   */
  private mapToList(list: ListUniversalData<TModel>[]): ListData<TModel>[] {
    if (!this.listConfig) return [];

    return list.map(item => {
      const icon = this.listConfig!.icon?.(item.model);
      return {
        ...item,
        id: item.model.id,
        firstLine: this.listConfig!.firstLine(item.model),
        secondLine: this.listConfig!.secondLine?.(item.model),
        avatar: this.getImageUrl(item.model, !icon ? this.listConfig!.avatarPlaceholder : undefined, this.listConfig!.avatar, this.listConfig!.avatarCacheBuster),
        icon: icon
      }
    });
  }

  //</editor-fold>

  //<editor-fold desc="Map to Grid">
  /**
   * Map the table data to the re-orderable grid data
   * @param list
   */
  private mapToGrid(list: ListUniversalData<TModel>[]): GridData<TModel>[] {
    return list.map(item => {
      const icon = this.gridConfig!.icon?.(item.model);
      return {
        ...item,
        id: item.model.id,
        title: this.gridConfig!.title(item.model),
        subTitle: this.gridConfig!.subTitle?.(item.model),
        image: this.getImageUrl(item.model, !icon ? this.gridConfig!.imagePlaceholder : undefined, this.gridConfig!.image, this.gridConfig!.imageCacheBuster),
        icon: icon,
        index: (item.model as Partial<ISorted>).index
      }
    });
  }

  //</editor-fold>

  //<editor-fold desc="Helpers">
  /**
   * Generates the Image URL with fallback and cache buster
   * @param data
   * @param fallback
   * @param getUrl
   * @param getCacheBuster
   */
  private getImageUrl(data: TModel, fallback?: string, getUrl?: (model: TModel) => string | undefined, getCacheBuster?: (model: TModel) => string | Date | undefined): string | undefined {
    if (!getUrl) return undefined;
    const url = getUrl(data);
    if (!url) return fallback;
    if (!getCacheBuster) return url;
    const cacheBuster = getCacheBuster(data);
    if (!cacheBuster) return url;
    const cbStr = cacheBuster instanceof Date ? (cacheBuster.getTime() / 1000).toFixed(0) : cacheBuster;
    return applyQueryParam(url, '_cb', cbStr);
  }

  /**
   * Maps an action config to undefined if invalid, or to an action if valid
   * @param data - The row data
   * @param config - The action config
   */
  private mapAction(data: TModel, config: ListActionConfig<TModel>): ListAction<TModel>|undefined {
    if (!config.action && !config.route) return undefined;
    if (config.filter && !config.filter(data)) return undefined;

    if (config.route === undefined) {
      return config as ListAction<TModel>;
    }

    return {name: config.name, icon: config.icon, color: config.color, newTab: !!config.newTab, route: config.route(data)};
  }
  //</editor-fold>

  //<editor-fold desc="Pagination">
  private readonly _page = signal<Pagination>({page: 0, pageSize: this.options.pageSize});
  public readonly page = this._page.asReadonly();

  /**
   * Re-calculate pagination based on the length of the content list
   * @private
   */
  private updatePage() {
    const length = this.filteredLength();
    if (length == 0) return;

    const page = this.page();
    if (page.page == 0) return;

    if (length > page.page * page.pageSize) return;

    this._page.set({pageSize: page.pageSize, page: Math.floor((length - 1) / page.pageSize)});
  }

  /**
   * Apply pagination to the data
   * @param list
   * @private
   */
  private paginate<TList>(list: TList[]): TList[] {
    if (list.length <= 0) return list;
    if (!this.options.paginated) return list;

    const pagination = this.page();
    return list.slice(pagination.page * pagination.pageSize, (pagination.page + 1) * pagination.pageSize);
  }

  /**
   * Change the location of the pagination
   * @param pageIndex
   */
  public setPage(pageIndex: number): void;
  /**
   * Change the location of the pagination
   * @param pageSize
   * @param pageIndex
   */
  public setPage({pageSize, pageIndex}: Page): void;
  public setPage(page: Page|number) {

    const pagination = isNumber(page)
      ? {pageSize: untracked(this.page).pageSize, page}
      : {pageSize: page.pageSize, page: page.pageIndex};

    this._page.set(pagination);
  }

  //</editor-fold>
}

interface Pagination {
  page: number;
  pageSize: number;
}

interface SortOption {
  id: string;
  name: string;
}
