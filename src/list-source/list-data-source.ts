import {asyncScheduler, BehaviorSubject, combineLatest, merge, Observable, of, ReplaySubject, startWith} from "rxjs";
import {catchError, distinctUntilChanged, map, switchMap, tap, throttleTime} from "rxjs/operators";
import Fuse from "fuse.js";
import {FilterServiceState} from "../filtering/filter-service";
import {
  GridData, GridDataConfig, HiddenSearchColumn, HiddenSortColumn, ListAction, ListActionConfig, ListData,
  ListDataConfig,
  ListDataSourceOptions, ListFlag,
  ListSearchData,
  ListUniversalData, TableColumn, TableData
} from "./list-data";
import {IListDataSourceConfig, ListDataSourceConfig} from "./list-source-config";
import {cache} from "../lib/rxjs";
import {ISorted, sortByIndexAsc} from "../lib/index-sort";
import {DetachedSearchData} from "../models/detached-search";
import FuseResult = Fuse.FuseResult;
import {applyQueryParam, arrToMap, mapArr, mapToArr, SimpleObject, SortFn, WithId} from "@consensus-labs/ts-tools";
import {Page, Sort} from "../lib/types";

export class ListDataSource<TModel extends WithId> {

  public static build<TModel extends WithId>(): IListDataSourceConfig<TModel> {
    return new ListDataSourceConfig<TModel>();
  }

  public columnIds: string[];
  public columns: TableColumn<TModel, any>[];

  public sortOptions: SortOption[];
  private sortLookup: Map<string, SortFn<TModel>>;
  private searchKeys: {weight?: number, key: string}[] = [];

  public paginated: boolean;
  public indexSorted: boolean;

  public gridFallbackImage?: string;
  public listFallbackImage?: string;

  //<editor-fold desc="Outputs">
  public simpleData$: Observable<ListUniversalData<TModel>[]>;
  public tableData$: Observable<TableData<TModel>[]>;
  public listData$: Observable<ListData<TModel>[]>;
  public gridData$: Observable<GridData<TModel>[]>;

  public simpleSearchData$: Observable<ListUniversalData<TModel>[]>;
  public tableSearchData$: Observable<TableData<TModel>[]>;
  public listSearchData$: Observable<ListData<TModel>[]>;
  public gridSearchData$: Observable<GridData<TModel>[]>;

  public simpleDisplayData$: Observable<ListUniversalData<TModel>[]>;
  public tableDisplayData$: Observable<TableData<TModel>[]>;
  public listDisplayData$: Observable<ListData<TModel>[]>;
  public gridDisplayData$: Observable<GridData<TModel>[]>;

  public itemLookup$: Observable<Map<string, TModel>>;
  //</editor-fold>

  constructor(
    private readonly options: ListDataSourceOptions<TModel>,
    private readonly tableColumns: Map<string, TableColumn<TModel, any>>,
    private readonly searchColumns: Map<string, HiddenSearchColumn<TModel>>,
    private readonly sortColumns: Map<string, HiddenSortColumn<TModel, any>>,
    private readonly listConfig?: ListDataConfig<TModel>,
    private readonly gridConfig?: GridDataConfig<TModel>,
  ) {

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
        this.sorting$.next({direction: options.defaultSortOrder, active: id});
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
        this.sorting$.next({direction: options.defaultSortOrder, active: col.id});
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

    this.page$ = new BehaviorSubject<Pagination>({page: 0, pageSize: options.pageSize});

    this.filter$ = this.options.filterService?.filter$ ?? of(undefined)
    //</editor-fold>

    //<editor-fold desc="Setup Observables">

    // Items
    this.itemList$ = merge(
      this._itemList$,
      this._itemListObservables$.pipe(switchMap(x => x))
    ).pipe(cache());

    this.itemLookup$ = this.itemList$.pipe(
      map(list => arrToMap(list, x => x.id, x => x)),
      cache()
    );

    // State
    this.empty$ = this.itemList$.pipe(map(x => !x.length), distinctUntilChanged());


    // Filtering
    const filtered$ = combineLatest([this.itemList$, this.filter$, this.blackList$, this._recalculate$]).pipe(
      map(([x, filter, blacklist]) => this.filter(x, filter, blacklist)),
      map(list => this.indexSort(list)),
      tap(list => this.updatePage(list.length))
    );

    const activeFilter$ = this.options.filterService?.activeFilters$?.pipe(
      map(x => x > 0),
      distinctUntilChanged(),
      cache()
    ) ?? of(false);

    this.filterActive$ = combineLatest([this.blackList$, activeFilter$]).pipe(
      map(([blacklist, filtered]) => !!blacklist.length || filtered),
      cache()
    );

    //Search Query
    const searchQuery$ = this.searchQuery$.pipe(
      throttleTime(800, asyncScheduler, {leading: false, trailing: true}),
      startWith(undefined),
      distinctUntilChanged(),
      cache()
    );

    this.searching$ = searchQuery$.pipe(
      map(x => !!x?.length),
      distinctUntilChanged(),
      cache()
    );

    // Setup search
    this.preSearchData$ = filtered$.pipe(
      map(list => this.mapToSearch(list)),
      tap(list => this.setupSearch(list)),
      cache()
    );

    // Search
    const searchData$ = combineLatest([
      this.preSearchData$,
      searchQuery$
    ]).pipe(
      map(([, query]) => this.search(query ?? '')),
      map(list => list.map(x => x.item.model))
    );

    this.simpleSearchData$ = searchData$.pipe(
      map(x => this.mapToUniversal(x)),
      cache()
    );

    this.tableSearchData$ = this.simpleSearchData$.pipe(
      map(x => this.mapToTable(x)),
      cache(),
    );

    this.listSearchData$ = this.simpleSearchData$.pipe(
      map(x => this.mapToList(x)),
      cache(),
    );

    this.gridSearchData$ = this.simpleSearchData$.pipe(
      map(x => this.mapToGrid(x)),
      cache()
    );

    // Sorting
    const sorted$ = combineLatest([filtered$, this.sorting$]).pipe(
      map(([list, sort]) => this.sort(list, sort))
    );

    // Pagination
    const paginated$ = combineLatest([sorted$, this.page$]).pipe(
      map(([list, page]) => this.paginate(list, page))
    )

    // Outputs
    this.simpleData$ = paginated$.pipe(
      map(x => this.mapToUniversal(x)),
      cache()
    );

    this.tableData$ = this.simpleData$.pipe(
      map(x => this.mapToTable(x)),
      cache(),
    );

    this.listData$ = this.simpleData$.pipe(
      map(x => this.mapToList(x)),
      cache(),
    );

    this.gridData$ = this.simpleData$.pipe(
      map(x => this.mapToGrid(x)),
      cache()
    );

    this.simpleDisplayData$ = this.searching$.pipe(
      switchMap((x) => x ? this.simpleSearchData$ : this.simpleData$)
    );
    this.tableDisplayData$ = this.searching$.pipe(
      switchMap((x) => x ? this.tableSearchData$ : this.tableData$)
    );
    this.listDisplayData$ = this.searching$.pipe(
      switchMap((x) => x ? this.listSearchData$ : this.listData$)
    );
    this.gridDisplayData$ = this.searching$.pipe(
      switchMap((x) => x ? this.gridSearchData$ : this.gridData$)
    );
    //</editor-fold>
  }

  //<editor-fold desc="Item Population">
  private readonly _itemList$ = new ReplaySubject<TModel[]>(1);
  private readonly _itemListObservables$ = new ReplaySubject<Observable<TModel[]>>(1);
  private readonly _recalculate$ = new BehaviorSubject<void>(undefined);

  public readonly itemList$: Observable<TModel[]>;
  public readonly empty$: Observable<boolean>;

  /**
   * Manually populate the data source
   * @param items
   */
  set items(items: TModel[]) {
    this._itemList$.next(items);
  }

  /**
   * Manually populate the data source via observable
   * @param items$
   */
  set items$(items$: Observable<TModel[]>) {
    this._itemListObservables$.next(items$.pipe(catchError(() => of([]))));
  }

  /**
   * Trigger a re-calculation of the data source pipeline
   */
  recalculate() {
    this._recalculate$.next();
  }

  //</editor-fold>

  //<editor-fold desc="Filtering">
  private filter$: Observable<FilterServiceState<unknown, TModel> | undefined>;
  public filterActive$: Observable<boolean>;

  private blackList$ = new BehaviorSubject<string[]>([]);

  /**
   * Define a list of Ids that will be removed from the final result
   * @param ids
   */
  set blackList(ids: string[] | undefined) {
    this.blackList$.next(ids ?? []);
  }

  /**
   * Apply the blacklist / service filter in the pipeline
   * @param list - The data
   * @param filter - A filter from the Filter Service
   * @param blacklist - A blacklist to exclude
   * @private
   */
  private filter(list: TModel[] | undefined, filter: FilterServiceState<unknown, TModel> | undefined, blacklist: string[]): TModel[] {

    if (!list?.length) return [];

    if (blacklist?.length) {
      const set = new Set<string>(blacklist);
      list = list.filter(x => !set.has(x.id));
    }

    if (!filter) return list;
    return filter.filter(list);
  }

  //</editor-fold>

  //<editor-fold desc="Map To Universal">
  mapToUniversal(list: TModel[]): ListUniversalData<TModel>[] {
    return list.map((row): ListUniversalData<TModel> => {

      const actions = mapArr(this.options.actions, action => this.mapAction(row, action));

      const flags = mapArr(this.options.flags, f => {
        const active = f.filter(row);
        const icon = active ? f.icon : f.inactiveIcon;
        const name = active ? f.name : f.inactiveName ?? f.name;
        return icon ? {icon, name} as ListFlag : null;
      });

      return {model: row, actions, flags};
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
    return list.map(row => {

      const data = {} as SimpleObject;
      this.tableColumns.forEach(col => {
        data[col.id] = col.mapData(row.model);
      });

      return {
        ...row,
        id: row.model.id,
        data
      };
    });
  }

  //</editor-fold>

  //<editor-fold desc="Search">
  searchQuery$ = new BehaviorSubject<string | undefined>(undefined);
  private preSearchData$: Observable<ListSearchData<TModel>[]>;
  private searcher?: Fuse<ListSearchData<TModel>>;
  private searchResultLimit = 200;

  searching$: Observable<boolean>;

  /**
   * Add a search map to models
   * @param list - List of models
   */
  mapToSearch(list: TModel[]): ListSearchData<TModel>[] {
    return list.map(row => {
      const search: Record<string, string> = {};

      for (let [id, col] of this.tableColumns) {
        if (!col.searchable) continue;
        const val = col.mapData(row)?.toString();
        if (val !== undefined) search[id] = val;
      }

      for (let [id, col] of this.searchColumns) {
        const val = col.mapData(row);
        if (val !== undefined) search[id] = val;
      }

      return {model: row, search};
    });
  }

  /**
   * Prepare the search algorithms
   * @param list
   * @private
   */
  private setupSearch(list: ListSearchData<TModel>[]) {
    if (!this.searcher) {
      this.searcher = new Fuse<ListSearchData<TModel>>(list, {
        includeScore: true,
        shouldSort: true,
        keys: this.searchKeys.map(({key, weight}) => ({
          name: ['search', key],
          weight: weight ?? 1
        }))
      });
      return;
    }

    this.searcher.setCollection(list);
  }

  /**
   * Apply the search algorithms
   * @param query
   * @param limit
   * @private
   */
  private search(query: string, limit?: number): FuseResult<ListSearchData<TModel>>[] {
    return this.searcher!.search(query, {limit: limit ?? this.searchResultLimit});
  }

  //</editor-fold>

  //<editor-fold desc="Detached Search">

  /**
   * Generate a detached search feed with a dedicated query
   * @param query$ - The dedicated query
   * @param limit - Limit the amount of search results
   */
  getDetachedSearch(query$: Observable<string>, limit = 20): Observable<DetachedSearchData<TModel>[]> {

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

    return combineLatest([this.preSearchData$, query$]).pipe(
      map(([, query]) => this.search(query ?? '', limit)),
      map(list => list.map(x => ({
        id: x.item.model.id,
        model: x.item.model,
        name: getName(x.item.model),
        icon: getIcon(x.item.model),
        extra: getExtra(x.item.model),
        score: x.score,
      } as DetachedSearchData<TModel>))),
      cache()
    );
  }

  //</editor-fold>

  //<editor-fold desc="Sorting">
  private static defaultSorting: Sort = {active: '', direction: 'asc'};
  private sorting$ = new BehaviorSubject<Sort>(ListDataSource.defaultSorting);

  get sorting() {
    return this.sorting$.value
  }

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
   * @param sort
   * @private
   */
  private sort(list: TModel[], sort: Sort): TModel[] {
    if (!sort.active?.length) return list;
    if (!sort.direction.length) return list;

    const sortFn = this.sortLookup.get(sort.active);
    if (!sortFn) return list;

    return [...list].sort(sort.direction == 'asc' ? sortFn : (a, b) => -1 * sortFn(a, b));
  }

  /**
   * Change the active sorting, or remove sorting
   * @param sort
   */
  setSort(sort?: Sort) {
    this.sorting$.next(sort ?? ListDataSource.defaultSorting);
  }

  //</editor-fold>

  //<editor-fold desc="Map to List">
  /**
   * Map the table data to the more compact List data
   * @param list - Table data
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
        icon: icon,
        cssClasses: this.listConfig!.styles.filter(style => style.condition(item.model)).map(x => x.cssClass)
      }
    });
  }

  //</editor-fold>

  //<editor-fold desc="Map to Grid">
  /**
   * Map the table data to the re-orderable grid data
   * @param list - Table data
   * @private
   */
  private mapToGrid(list: ListUniversalData<TModel>[]): GridData<TModel>[] {
    if (!this.gridConfig) return [];

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

    return {name: config.name, icon: config.icon, color: config.color, route: config.route(data)};
  }
  //</editor-fold>

  //<editor-fold desc="Pagination">
  private page$: BehaviorSubject<Pagination>;

  /**
   * The current pagination page
   */
  get page() {
    return this.page$.value
  }

  private _length = 0;
  get length() {
    return this._length
  }

  /**
   * Re-calculate pagination based on the length of the content list
   * @param listLength
   * @private
   */
  private updatePage(listLength: number) {
    this._length = listLength;
    const page = this.page$.value;
    if (listLength == 0 || listLength > page.page * page.pageSize) return;

    this.page$.next({pageSize: page.pageSize, page: Math.floor((listLength - 1) / page.pageSize)});
  }

  /**
   * Apply pagination to the data
   * @param list
   * @param pagination
   * @private
   */
  private paginate<TList>(list: TList[], pagination: Pagination): TList[] {
    if (!this.options.paginated) return list;
    return list.slice(pagination.page * pagination.pageSize, (pagination.page + 1) * pagination.pageSize);
  }

  /**
   * Change the location of the pagination
   * @param pageSize
   * @param pageIndex
   */
  public setPage({pageSize, pageIndex}: Page) {
    this.page$.next({page: pageIndex, pageSize});
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


