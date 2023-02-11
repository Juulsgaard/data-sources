import {
  asyncScheduler, auditTime, BehaviorSubject, combineLatest, merge, Observable, of, ReplaySubject, startWith
} from "rxjs";
import {catchError, distinctUntilChanged, map, switchMap, tap, throttleTime} from "rxjs/operators";
import Fuse from "fuse.js";
import {
  BaseTreeFolder, BaseTreeItem, TreeAsideData, TreeAsideFolderData, TreeAsideItemData, TreeDataSourceOptions,
  TreeFolder, TreeFolderAction, TreeFolderActionConfig, TreeFolderData,
  TreeFolderSearchData, TreeFolderSearchRowData, TreeHiddenSearchColumnConfig, TreeHiddenSortColumnConfig, TreeItem,
  TreeItemAction,
  TreeItemActionConfig,
  TreeItemData, TreeItemSearchData,
  TreeItemSearchRowData, TreeRowConfig, TreeSearchColumnConfig, TreeSearchConfig, TreeSearchData, TreeSearchRowData,
  TreeSortConfig
} from "./tree-data";
import {TreeFolderFilterState, TreeItemFilterState} from "../filtering/filter-service";
import {BulkRelocateModel, MoveModel} from "../models/move";
import {cache} from "@consensus-labs/rxjs-tools";
import {TreeDataOptionConfig} from "./tree-source-config";
import {DetachedSearchData} from "../models/detached-search";
import {
  applySelector, arrToLookup, arrToMap, mapArr, mapToArr, Selection, SimpleObject, SortFn, titleCase, WithId
} from "@consensus-labs/ts-tools";
import {Sort} from "../lib/types";
import {ListAction} from "../list-source/list-data";

export class TreeDataSource<TFolder extends WithId, TItem extends WithId> {

  //<editor-fold desc="Outputs">
  treeData$: Observable<TreeFolderData<TFolder, TItem>[]>;

  searchResult$: Observable<TreeSearchRowData<TFolder, TItem>[]>;
  folderSearchResult$: Observable<TreeFolderSearchRowData<TFolder, TItem>[]>;
  itemSearchResult$: Observable<TreeItemSearchRowData<TFolder, TItem>[]>;

  //</editor-fold>

  //<editor-fold desc="Lookups">
  baseItems$: Observable<BaseTreeItem<TItem>[]>;
  metaItems$: Observable<TreeItem<TFolder, TItem>[]>;

  itemLookup$: Observable<Map<string, TItem>>;
  baseItemLookup$: Observable<Map<string, BaseTreeItem<TItem>>>;
  metaItemLookup$: Observable<Map<string, TreeItem<TFolder, TItem>>>;

  baseFolders$: Observable<BaseTreeFolder<TFolder>[]>;
  metaFolders$: Observable<TreeFolder<TFolder, TItem>[]>;

  folderLookup$: Observable<Map<string, TFolder>>;
  baseFolderLookup$: Observable<Map<string, BaseTreeFolder<TFolder>>>;
  metaFolderLookup$: Observable<Map<string, TreeFolder<TFolder, TItem>>>;
  //</editor-fold>

  public columns: TreeSearchColumnConfig<TFolder, any, TItem, any>[];
  public sortOptions: SortOption[] = [];
  public hiddenSortOptions: SortOption[] = [];

  private sortLookup = new Map<string, TreeSortConfig<TFolder, TItem, unknown>>();
  private searchConfigs = new Map<string, TreeSearchConfig<TFolder, TItem>>();

  public hasActions: boolean;

  //<editor-fold desc="Move Actions">
  canMoveFolder$: Observable<boolean>;
  canMoveItem$: Observable<boolean>;

  onFolderMove?: (data: MoveModel) => Promise<unknown>|void;
  onItemMove?: (data: MoveModel) => Promise<unknown>|void;
  onFolderRelocate?: (data: BulkRelocateModel) => Promise<unknown>|void;
  onItemRelocate?: (data: BulkRelocateModel) => Promise<unknown>|void;
  //</editor-fold>

  constructor(
    private readonly options: TreeDataSourceOptions<TFolder, TItem>,
    private readonly searchColumns: TreeSearchColumnConfig<TFolder, any, TItem, any>[],
    private readonly hiddenSearchColumn: TreeHiddenSearchColumnConfig<TFolder, TItem>[],
    private readonly hiddenSortColumns: TreeHiddenSortColumnConfig<TFolder, TItem, any>[],
    private readonly treeConfig?: TreeRowConfig<TFolder, TItem>,
  ) {

    if (!options.itemParentId && !options.folderChildren) {
      throw Error('Tree Data Source need either itemParentId or folderChildren defined');
    }

    //<editor-fold desc="Initialise">

    this.hasActions = !!options.folderActions.length || !!options.itemActions.length;

    this.columns = [...this.searchColumns];

    for (let col of hiddenSortColumns) {
      this.sortOptions.push({id: col.id, name: col.title});
      this.hiddenSortOptions.push({id: col.id, name: col.title});
      this.sortLookup.set(col.id, {...col});
    }

    for (let col of hiddenSearchColumn) {
      this.searchConfigs.set(col.id, col);
    }

    for (let col of searchColumns) {
      if (col.sorting) {
        this.sortOptions.push({id: col.id, name: col.title ?? titleCase(col.id)});
        this.sortLookup.set(col.id, col.sorting);
      }

      if (col.searching) {
        this.searchConfigs.set(col.id, col.searching);
      }
    }

    // Folder Filter
    this.folderFilter$ = this.options.folderFilterService?.filter$ ?? of(undefined);

    const folderFilterActive$ = this.options.folderFilterService?.activeFilters$?.pipe(
      map(x => x > 0),
      distinctUntilChanged()
    ) ?? of(false);

    this.foldersFiltered$ = combineLatest([this.folderBlackList$, folderFilterActive$]).pipe(
      map(([blacklist, filtered]) => !!blacklist.length || filtered),
      distinctUntilChanged(),
      cache()
    );


    // Item Filter
    this.itemFilter$ = this.options.itemFilterService?.filter$ ?? of(undefined);

    const itemFilterActive$ = this.options.itemFilterService?.activeFilters$?.pipe(
      map(x => x > 0),
      distinctUntilChanged()
    ) ?? of(false);

    this.itemsFiltered$ = combineLatest([this.itemBlackList$, itemFilterActive$]).pipe(
      map(([blacklist, filtered]) => !!blacklist.length || filtered),
      distinctUntilChanged(),
      cache()
    );

    // Move Actions
    this.canMoveFolder$ = options.moveActions.moveFolder ? this.foldersFiltered$.pipe(map(x => !x)) : of(false);
    this.canMoveItem$ = options.moveActions.moveItem ? this.itemsFiltered$.pipe(map(x => !x)) : of(false);

    this.onFolderRelocate = options.moveActions.relocateFolders;
    this.onItemRelocate = options.moveActions.relocateItems;
    this.onFolderMove = options.moveActions.moveFolder;
    this.onItemMove = options.moveActions.moveItem;
    //</editor-fold>

    //<editor-fold desc="Setup Observables">

    //<editor-fold desc="Base Lists">
    // Folders
    this.folderList$ = merge(
      this._folderList$,
      this._folderListObservables$.pipe(switchMap(x => x))
    ).pipe(cache());

    if (options.folderParentId) {
      const folderParentId = options.folderParentId;

      this.baseFolders$ = this.folderList$.pipe(
        map((folders) => folders.map(folder => ({
          model: folder,
          parentId: applySelector(folder, folderParentId)
        }))),
        cache()
      );

    } else {

      this.baseFolders$ = this.folderList$.pipe(
        map((folders) => folders.map(folder => ({model: folder}))),
        cache()
      );

    }

    // Items
    if (options.folderChildren) {
      const folderChildren = options.folderChildren;

      this.itemList$ = this.folderList$.pipe(
        map(list => list.flatMap(folder => applySelector(folder, folderChildren))),
        cache()
      );

      this.baseItems$ = this.folderList$.pipe(
        map(list => list.flatMap(
          folder => applySelector(folder, folderChildren).map(item => ({
            folderId: folder.id,
            model: item
          }))
        )),
        cache()
      );

    } else if(options.itemParentId) {

      const itemParentId = options.itemParentId;

      this.itemList$ = merge(
        this._itemList$,
        this._itemListObservables$.pipe(switchMap(x => x))
      ).pipe(cache());

      this.baseItems$ = this.itemList$.pipe(
        map(list => list.map(item => ({
          folderId: applySelector(item, itemParentId),
          model: item
        }))),
        cache()
      );

    } else {
      throw Error("Invalid state");
    }
    //</editor-fold>

    // Nest data for lookups
    const nestedData$ = combineLatest([this.baseFolders$, this.baseItems$]).pipe(
      auditTime(0),
      map(([folders, items]) => this.nestData(folders, items)),
      cache()
    );

    this.metaFolders$ = nestedData$.pipe(
      map(({folders}) => folders),
      cache()
    );

    this.metaItems$ = nestedData$.pipe(
      map(({items}) => items),
      cache()
    );

    //<editor-fold desc="Lookups">
    this.folderLookup$ = this.folderList$.pipe(
      map(list => arrToMap(list, x => x.id, x => x)),
      cache()
    );

    this.baseFolderLookup$ = this.baseFolders$.pipe(
      map(list => arrToMap(list, x => x.model.id, x => x)),
      cache()
    );

    this.metaFolderLookup$ = this.metaFolders$.pipe(
      map(list => arrToMap(list, x => x.model.id, x => x)),
      cache()
    );

    this.itemLookup$ = this.itemList$.pipe(
      map(list => arrToMap(list, x => x.id, x => x)),
      cache()
    );

    this.baseItemLookup$ = this.baseItems$.pipe(
      map(list => arrToMap(list, x => x.model.id, x => x)),
      cache()
    );

    this.metaItemLookup$ = this.metaItems$.pipe(
      map(list => arrToMap(list, x => x.model.id, x => x)),
      cache()
    );
    //</editor-fold>

    // State
    this.foldersEmpty$ = this.folderList$.pipe(map(x => !x.length), distinctUntilChanged());
    this.itemsEmpty$ = this.itemList$.pipe(map(x => !x.length), distinctUntilChanged());


    // Filtering

    const filteredFolders$ = combineLatest([this.baseFolders$, this.folderFilter$, this.folderBlackList$]).pipe(
      map(([x, filter, blacklist]) => this.filterFolders(x, filter, blacklist)),
      cache()
    );

    const filteredItems$ = combineLatest([this.baseItems$, this.itemFilter$, this.itemBlackList$]).pipe(
      map(([x, filter, blacklist]) => this.filterItems(x, filter, blacklist)),
      cache()
    );

    // Apply Nesting
    const filteredNestedData$ = combineLatest([filteredFolders$, filteredItems$]).pipe(
      auditTime(0),
      map(([folders, items]) => this.nestData(folders, items)),
      cache()
    );

    this.filteredFolderLookup$ = filteredNestedData$.pipe(
      map(x => x.folders),
      map(folders => arrToMap(folders, x => x.model.id, x => x)),
      cache()
    );


    // Tree Output
    this.treeData$ = filteredNestedData$.pipe(
      map(({folders}) => this.mapToTree(folders)),
      cache(),
    );

    this.folderSearchData$ = filteredNestedData$.pipe(
      map(x => x.folders),
      map(x => this.mapFolderSearchData(x)),
      tap(list => this.setupFolderSearch(list)),
      cache()
    );

    this.itemSearchData$ = filteredNestedData$.pipe(
      map(x => x.items),
      map(x => this.mapItemSearchData(x)),
      tap(list => this.setupItemSearch(list)),
      cache()
    );

    // Search Query
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

    // Searching
    const folderSearchData = combineLatest([this.folderSearchData$, searchQuery$]).pipe(
      map(([, q]) => this.searchFolders(q ?? '')),
      cache()
    );

    const itemSearchData = combineLatest([this.itemSearchData$, searchQuery$]).pipe(
      map(([, q]) => this.searchItems(q ?? '')),
      cache()
    );

    // Merge Search
    const mergedSearchData = combineLatest([folderSearchData, itemSearchData]).pipe(
      auditTime(0),
      map(([folders, items]) => [...folders, ...items]),
      map(list => list.sort((a, b) => (a?.score ?? 0) - (b?.score ?? 0))),
      map(list => list.map(x => x.item))
    );

    // Sorting
    this.searchResult$ = combineLatest([mergedSearchData, this.sorting$]).pipe(
      map(([list, sort]) => this.sort(list, sort)),
      map(list => this.mapSearchRows(list)),
      cache()
    );

    const cleanFolderSearchData = folderSearchData.pipe(map(list => list.map(x => x.item)));
    this.folderSearchResult$ = combineLatest([cleanFolderSearchData, this.sorting$]).pipe(
      map(([list, sort]) => this.sort(list, sort)),
      map(list => this.mapSearchRows(list) as TreeFolderSearchRowData<TFolder, TItem>[]),
      cache()
    );

    const cleanItemSearchData = itemSearchData.pipe(map(list => list.map(x => x.item)));
    this.itemSearchResult$ = combineLatest([cleanItemSearchData, this.sorting$]).pipe(
      map(([list, sort]) => this.sort(list, sort)),
      map(list => this.mapSearchRows(list) as TreeItemSearchRowData<TFolder, TItem>[]),
      cache()
    );

    //</editor-fold>
  }

  //<editor-fold desc="Folder Population">
  private readonly _folderList$ = new ReplaySubject<TFolder[]>(1);
  private readonly _folderListObservables$ = new ReplaySubject<Observable<TFolder[]>>(1);
  private readonly _recalculateFolders$ = new BehaviorSubject<void>(undefined);

  public readonly folderList$: Observable<TFolder[]>;
  public readonly foldersEmpty$: Observable<boolean>;

  /**
   * Populate folder list
   * This triggers all affected data sources to re-evaluate
   * @param folders - A list of Folders
   */
  set folders(folders: TFolder[]) {
    this._folderList$.next(folders);
  }

  /**
   * Manually populate the folder data via observable
   * @param folders$
   */
  set folders$(folders$: Observable<TFolder[]>) {
    this._folderListObservables$.next(folders$.pipe(catchError(() => of([]))));
  }

  /**
   * Trigger a re-calculation of the folder data source pipeline
   */
  recalculateFolder() {
    this._recalculateFolders$.next();
  }

  //</editor-fold>

  //<editor-fold desc="Item Population">
  private readonly _itemList$ = new ReplaySubject<TItem[]>(1);
  private readonly _itemListObservables$ = new ReplaySubject<Observable<TItem[]>>(1);
  private readonly _recalculateItems$ = new BehaviorSubject<void>(undefined);

  public readonly itemList$: Observable<TItem[]>;
  public readonly itemsEmpty$: Observable<boolean>;

  /**
   * Populate item list
   * This triggers all affected data sources to re-evaluate
   * @param items - A list of Items
   */
  set items(items: TItem[]) {
    this._itemList$.next(items);
  }

  /**
   * Manually populate the item data via observable
   * @param items$
   */
  set items$(items$: Observable<TItem[]>) {
    this._itemListObservables$.next(items$.pipe(catchError(() => of([]))));
  }

  /**
   * Trigger a re-calculation of the item data source pipeline
   */
  recalculateItems() {
    this._recalculateItems$.next();
  }

  //</editor-fold>

  //<editor-fold desc="Filtering">
  private folderFilter$: Observable<TreeFolderFilterState<unknown, TFolder>|undefined>;
  private itemFilter$: Observable<TreeItemFilterState<unknown, TItem>|undefined>;

  private itemBlackList$ = new BehaviorSubject<string[]>([]);
  private folderBlackList$ = new BehaviorSubject<string[]>([]);

  public foldersFiltered$: Observable<boolean>;
  public itemsFiltered$: Observable<boolean>;

  private filteredFolderLookup$: Observable<Map<string, TreeFolder<TFolder, TItem>>>;

  /**
   * Define a list of Item Ids that will be removed from the final result
   * @param ids
   */
  set itemBlackList(ids: string[] | undefined) {
    this.itemBlackList$.next(ids ?? []);
  }

  /**
   * Define a list of Folder Ids that will be removed from the final result
   * @param ids
   */
  set folderBlackList(ids: string[] | undefined) {
    this.folderBlackList$.next(ids ?? []);
  }

  /**
   * Filters a list of DeepFolders
   * @param list - Folders
   * @param filter - The filter state
   * @param blacklist - Folders to exclude
   * @return folders - A filtered list of folders
   * @private
   */
  private filterFolders(
    list: BaseTreeFolder<TFolder>[],
    filter?: TreeFolderFilterState<unknown, TFolder>,
    blacklist?: string[]
  ): BaseTreeFolder<TFolder>[] {

    if (blacklist?.length) {
      const set = new Set<string>(blacklist);
      list = list.filter(x => !set.has(x.model.id));
    }

    if (!filter) return list;
    return filter.filter(list);
  }

  /**
   * Filters a list of Items
   * @param list - List of Items
   * @param filter - The filter state
   * @param blacklist - Items to exclude
   * @return items - Filtered list of Items
   * @private
   */
  private filterItems(
    list: BaseTreeItem<TItem>[],
    filter?: TreeItemFilterState<unknown, TItem>,
    blacklist?: string[]
  ):  BaseTreeItem<TItem>[] {
    if (!list) return [];

    if (blacklist?.length) {
      const set = new Set<string>(blacklist);
      list = list.filter(x => !set.has(x.model.id));
    }

    if (!filter) return list;
    return filter.filter(list);
  }

  //</editor-fold>

  //<editor-fold desc="Nest Data">
  /**
   * Turns an Item and Folders list into a nested data structure with added metadata to folders
   * @param folders - A list of Folders
   * @param items - A list of Items
   * @return nested data - A list of all folders with added Metadata
   * @private
   */
  private nestData(
    folders: BaseTreeFolder<TFolder>[],
    items: BaseTreeItem<TItem>[]
  ): {folders: TreeFolder<TFolder, TItem>[], items: TreeItem<TFolder, TItem>[]} {

    if (!folders?.length) return {folders: [], items: []};

    const mappedItems = items.map(x => ({...x}) as TreeItem<TFolder, TItem>);
    const folderItemLookup = arrToLookup(mappedItems, x => x.folderId, x => x);

    // Map base info for folders
    const mappedFolders = folders.map(folder => {

      const items = folderItemLookup.get(folder.model.id) ?? [];
      if (this.options.itemSort) {
        items.sort((a, b) => this.options.itemSort!(a.model, b.model));
      }

      const newFolder = {
        ...folder,
        items,
        folders: [],
        folderCount: 0,
        itemCount: items.length,
        path: []
      } as TreeFolder<TFolder, TItem>;

      for (let item of items) {
        item.folder = newFolder;
      }

      return newFolder;
    });

    // If there is no folder nesting, then return folders and items
    if (!this.options.folderParentId) {

      return {folders: mappedFolders, items: mappedItems};
    }

    const folderLookup = arrToLookup(mappedFolders, x => x.parentId, x => x);

    // Assign sub folders
    for (let folder of mappedFolders) {

      const subFolders = folderLookup.get(folder.model.id) ?? [];

      if (this.options.folderSort) {
        subFolders.sort((a, b) => this.options.folderSort!(a.model, b.model));
      }

      folder.folders = subFolders;
    }

    const root = folderLookup.get(null) ?? [];

    for (let folder of root) {
      this.populateDeepFolder(folder, []);
    }

    return {folders: mappedFolders, items: mappedItems};
  }

  /**
   * Populates deep folders with itemCount and paths
   * @param folder - Current Folder
   * @param path - Current path
   * @return counts - The item and folder count of the folder
   * @private
   */
  private populateDeepFolder(folder: TreeFolder<TFolder, TItem>, path: TreeFolder<TFolder, TItem>[]): {folderCount: number, itemCount: number} {

    folder.path = path;

    let folderCount = folder.folders.length;
    let itemCount = folder.items.length;

    const newPath = [...path, folder];

    for (let subFolder of folder.folders) {
      const counts = this.populateDeepFolder(subFolder, newPath);
      folderCount += counts.folderCount;
      itemCount += counts.itemCount;
    }

    folder.folderCount = folderCount;
    folder.itemCount = itemCount;

    return {folderCount, itemCount};
  }

  //</editor-fold>

  //<editor-fold desc="Action Mapping">

  private mapFolderActions(folder: TreeFolder<TFolder, TItem>): TreeFolderAction<TFolder, TItem>[] {
    return mapArr(
      this.options.folderActions,
      (config): TreeFolderAction<TFolder, TItem>|undefined => {
        if (!config.action && !config.route) return undefined;
        if (config.filter && !config.filter(folder.model, folder)) return undefined;

        if (config.route === undefined) {
          return config as TreeFolderAction<TFolder, TItem>;
        }

        return {name: config.name, icon: config.icon, color: config.color, route: config.route(folder.model, folder)};
      }
    );
  }

  private mapItemActions(folder: TreeItem<TFolder, TItem>): TreeItemAction<TFolder, TItem>[] {
    return mapArr(
      this.options.itemActions,
      (config): TreeItemAction<TFolder, TItem>|undefined => {
        if (!config.action && !config.route) return undefined;
        if (config.filter && !config.filter(folder.model, folder)) return undefined;

        if (config.route === undefined) {
          return config as TreeItemAction<TFolder, TItem>;
        }

        return {name: config.name, icon: config.icon, color: config.color, route: config.route(folder.model, folder)};
      }
    );
  }

  //</editor-fold>

  //<editor-fold desc="Sidebar Data">

  public getSidebarData(folderId$: Observable<string|undefined>): Observable<TreeAsideData<TFolder, TItem>> {

    return folderId$.pipe(
      switchMap(folderId => this.filteredFolderLookup$.pipe(
        map(lookup => this.mapSidebarData(folderId, lookup))
      )),
      cache()
    );
  }

  private mapSidebarData(folderId: string|undefined, lookup: Map<string, TreeFolder<TFolder, TItem>>): TreeAsideData<TFolder, TItem> {

    const folder = folderId ? lookup.get(folderId) : undefined;
    if (!folder) return this.mapSidebarRoot(lookup);

    const folders = folder.folders.map(x => this.mapSidebarFolder(x));
    const items = folder.items.map(x => this.mapSidebarItem(x));
    const path = folder.path.map(x => ({name: this.treeConfig?.folderName(x.model, x) ?? '--', model: x}));

    return {
      model: folder,
      name: this.treeConfig?.folderName?.(folder.model, folder) ?? 'N/A',
      icon: this.getFolderIcon(folder),
      bonus: this.treeConfig?.folderBonus?.(folder.model, folder),
      folders,
      items,
      actions: this.mapFolderActions(folder),
      path
    }
  }

  private mapSidebarRoot(lookup: Map<string, TreeFolder<TFolder, TItem>>): TreeAsideData<TFolder, TItem> {

    const folders = mapToArr(lookup)
      .filter(folder => folder.parentId == undefined)
      .map(folder => this.mapSidebarFolder(folder));

    return {
      model: undefined,
      name: 'Root',
      icon: folders.length > 0 ? 'fad fa-folder' : 'fad fa-folder-blank',
      folders,
      items: [],
      actions: [],
      path: []
    }
  }

  private mapSidebarFolder(folder: TreeFolder<TFolder, TItem>): TreeAsideFolderData<TFolder, TItem> {
    return {
      model: folder,
      name: this.treeConfig?.folderName(folder.model, folder) ?? 'N/A',
      bonus: this.treeConfig?.folderBonus?.(folder.model, folder),
      icon: this.getFolderIcon(folder),
      actions: this.mapFolderActions(folder)
    };
  }

  private mapSidebarItem(item: TreeItem<TFolder, TItem>): TreeAsideItemData<TFolder, TItem> {
    return {
      model: item,
      name: this.treeConfig?.itemName(item.model, item) ?? 'N/A',
      bonus: this.treeConfig?.itemBonus?.(item.model, item),
      icon: this.getItemIcon(item),
      actions: this.mapItemActions(item)
    };
  }

  //</editor-fold>

  //<editor-fold desc="Map to Tree">
  /**
   * Maps a list of Deep Folders into the display type for trees
   * @param folders - A list of Deep Folders
   * @return treeRoot - A nested structure with all tree display data
   * @private
   */
  private mapToTree(folders: TreeFolder<TFolder, TItem>[]): TreeFolderData<TFolder, TItem>[] {

    const root = folders.filter(x => x.parentId == undefined);

    if (this.options.folderSort) {
      root.sort((a, b) => this.options.folderSort!(a.model, b.model));
    }

    if (!this.treeConfig) return [];

    return root.map(x => this.mapTreeFolder(x));
  }

  /**
   * Recursively maps Deep Folders to a display format
   * @param folder - The current Deep Folder
   * @return treeFolder - A deep folder in display format
   * @private
   */
  private mapTreeFolder(folder: TreeFolder<TFolder, TItem>): TreeFolderData<TFolder, TItem> {

    const folders = folder.folders.map(x => this.mapTreeFolder(x));
    const items = folder.items.map(x => this.mapTreeItem(x));

    return {
      model: folder,
      items,
      folders,
      actions: this.mapFolderActions(folder),
      data: {
        name: this.treeConfig!.folderName(folder.model, folder),
        icon: this.getFolderIcon(folder),
        bonus: this.treeConfig!.folderBonus?.(folder.model, folder),
        tooltip: this.treeConfig!.folderTooltip?.(folder.model, folder),
      }
    };
  }

  /**
   * Maps a list of items to a display format
   * @param item - The item to map
   * @return treeItem - The mapped item in display format
   * @private
   */
  private mapTreeItem(item: TreeItem<TFolder, TItem>): TreeItemData<TFolder, TItem> {
    return {
      model: item,
      actions: this.mapItemActions(item),
      data: {
        icon: this.getItemIcon(item),
        name: this.treeConfig!.itemName(item.model, item),
        bonus: this.treeConfig!.itemBonus?.(item.model, item),
        tooltip: this.treeConfig!.itemTooltip?.(item.model, item),
      }
    };
  }

  //</editor-fold>

  //<editor-fold desc="Map to Search">

  /**
   * Maps Folders to searchable variants
   * @param folders - The Folders
   * @return searchFolders - searchable variants of the Folder
   * @private
   */
  private mapFolderSearchData(folders: TreeFolder<TFolder, TItem>[]): TreeFolderSearchData<TFolder, TItem>[] {

    return folders.map(folder => {
      const search: Record<string, string> = {};

      for (let [id, conf] of this.searchConfigs) {
        if (!conf.mapFolder) continue;
        const val = conf.mapFolder(folder.model, folder);
        if (val !== undefined) search[id] = val;
      }

      return {model: folder, isFolder: true, search} as TreeFolderSearchData<TFolder, TItem>;
    });
  }

  /**
   * Maps an item to searchable variants
   * @param items - The Items
   * @return searchItems - The mapped search variants of the Item
   * @private
   */
  private mapItemSearchData(items: TreeItem<TFolder, TItem>[]): TreeItemSearchData<TFolder, TItem>[] {

    return items.map(item => {
      const search: Record<string, string> = {};

      for (let [id, conf] of this.searchConfigs) {
        if (!conf.mapItem) continue;
        const val = conf.mapItem(item.model, item);
        if (val !== undefined) search[id] = val;
      }

      return {model: item, isFolder: false, search} as TreeItemSearchData<TFolder, TItem>;
    });
  }

  private mapSearchRows(list: TreeSearchData<TFolder, TItem>[]): TreeSearchRowData<TFolder, TItem>[]  {

    return list.map(({search, ...row}) => {
      const data = {} as SimpleObject;

      for (let col of this.searchColumns) {
        data[col.id] = row.isFolder
          ? col.folder.mapData(row.model.model, row.model)
          : col.item.mapData(row.model.model, row.model);
      }

      if (row.isFolder) {
        return {
          ...row, data,
          actions: this.mapFolderActions(row.model)
        };
      }

      return {
        ...row, data,
        actions: this.mapItemActions(row.model)
      };
    });

  }

  //</editor-fold>

  //<editor-fold desc="Search">
  public searchQuery$ = new BehaviorSubject<string | undefined>(undefined);

  private folderSearcher?: Fuse<TreeFolderSearchData<TFolder, TItem>>;
  private itemSearcher?: Fuse<TreeItemSearchData<TFolder, TItem>>;

  private searchResultLimit = 100;

  private folderSearchData$: Observable<TreeFolderSearchData<TFolder, TItem>[]>;
  private itemSearchData$: Observable<TreeItemSearchData<TFolder, TItem>[]>;

  searching$: Observable<boolean>;

  public clearSearch() {
    this.searchQuery$.next(undefined);
  }

  /**
   * Register Folders for Fuzzy Search
   * @param folders - Folder search data
   * @private
   */
  private setupFolderSearch(folders: TreeFolderSearchData<TFolder, TItem>[]) {

    if (this.folderSearcher) {
      this.folderSearcher.setCollection(folders);
      return;
    }

    this.folderSearcher = new Fuse<TreeFolderSearchData<TFolder, TItem>>(folders, {
      includeScore: true,
      shouldSort: true,
      keys: mapToArr(this.searchConfigs, (col, key) => ({key, col}))
        .filter(({col}) => !!col.mapFolder)
        .map(({key, col}) => ({
          name: ['search', key],
          weight: col.weight ?? 1
        }))
    });
  }

  /**
   * Register Items for Fuzzy Search
   * @param items - Item search data
   * @private
   */
  private setupItemSearch(items: TreeItemSearchData<TFolder, TItem>[]) {

    if (this.itemSearcher) {
      this.itemSearcher.setCollection(items);
      return;
    }

    this.itemSearcher = new Fuse<TreeItemSearchData<TFolder, TItem>>(items, {
      includeScore: true,
      shouldSort: true,
      keys: mapToArr(this.searchConfigs, (val, key) => ({key, val}))
        .filter(({val}) => !!val.mapItem)
        .map(({key}) => ['search', key])
    });
  }

  /**
   * Search folders
   * @param query - Search Query
   * @param limit
   * @return folders - Folders that match the search query
   * @private
   */
  private searchFolders(query: string, limit?: number) {
    return this.folderSearcher!.search(query, {limit: limit ?? this.searchResultLimit});
  }

  /**
   * Search items
   * @param query - Search Query
   * @param limit
   * @return items - Items that match the search query
   * @private
   */
  private searchItems(query: string, limit?: number) {
    return this.itemSearcher!.search(query, {limit: limit ?? this.searchResultLimit});
  }

  //</editor-fold>

  //<editor-fold desc="Detached Search">

  /**
   * Generate a detached search feed with a dedicated query for Folders
   * @param query$ - The dedicated query
   * @param limit - Limit the amount of search results
   */
  getDetachedFolderSearch(query$: Observable<string>, limit = 20): Observable<DetachedSearchData<TreeFolder<TFolder, TItem>>[]> {

    return combineLatest([this.folderSearchData$, query$]).pipe(
      map(([, query]) => this.searchFolders(query ?? '', 20)),
      map(list => list.map(({score, item}) => ({
        id: item.model.model.id,
        model: item.model,
        name: this.treeConfig?.folderName(item.model.model, item.model),
        icon: this.getFolderIcon(item.model),
        extra: this.treeConfig?.folderBonus?.(item.model.model, item.model),
        score: score
      } as DetachedSearchData<TreeFolder<TFolder, TItem>>))),
      cache()
    );
  }

  /**
   * Generate a detached search feed with a dedicated query for Items
   * @param query$ - The dedicated query
   * @param limit - Limit the amount of search results
   */
  getDetachedItemSearch(query$: Observable<string>, limit = 20): Observable<DetachedSearchData<TreeItem<TFolder, TItem>>[]> {

    return combineLatest([this.itemSearchData$, query$]).pipe(
      map(([, query]) => this.searchItems(query ?? '', 20)),
      map(list => list.map(({score, item}) => ({
        id: item.model.model.id,
        model: item.model,
        name: this.treeConfig?.itemName(item.model.model, item.model),
        icon: this.getItemIcon(item.model),
        extra: this.treeConfig?.itemBonus?.(item.model.model, item.model),
        score: score
      } as DetachedSearchData<TreeItem<TFolder, TItem>>))),
      cache()
    );
  }

  //</editor-fold>

  //<editor-fold desc="Sorting">
  private sorting$ = new BehaviorSubject<Sort>({active: '', direction: 'asc'});

  get sorting() {
    return this.sorting$.value
  }

  /**
   * Sort search results
   * @param list - Merged tree search results
   * @param sort - Sort options
   * @return sortedList - Sorted search results
   * @private
   */
  private sort(list: TreeSearchData<TFolder, TItem>[], sort: Sort): TreeSearchData<TFolder, TItem>[] {
    if (!sort.active?.length) return list;
    if (!sort.direction.length) return list;

    const sortConfig = this.sortLookup.get(sort.active);
    if (!sortConfig) return list;

    const mapped = list.map(row => ({
      data: row,
      sort: row.isFolder
        ? sortConfig.folderSortData(row.model.model, row.model)
        : sortConfig.itemSortData(row.model.model, row.model)
    }));

    const sortFn: SortFn<{sort: any}> = (a, b) => sortConfig.sortFn(a.sort, b.sort);

    return mapped
      .sort(sort.direction == 'asc' ? sortFn : (a, b) => -1 * sortFn(a, b))
      .map(x => x.data);
  }

  /**
   * Set the current sorting config
   * @param sort
   */
  setSort(sort: Sort) {
    this.sorting$.next(sort);
  }

  //</editor-fold>

  //<editor-fold desc="Utility">
  /**
   * Map a folder icon
   * @param folder - The folder
   * @return icon - The mapped icon value
   * @private
   */
  private getFolderIcon(folder: TreeFolder<TFolder, TItem>): string {
    return this.treeConfig?.folderIcon?.(folder.model, folder)
      ?? (folder.itemCount > 0 || folder.folderCount > 0 ? 'fas fa-folder' : 'fas fa-folder-blank');
  }

  private getItemIcon(item: TreeItem<TFolder, TItem>): string {
    return this.treeConfig?.itemIcon?.(item.model, item) ?? 'fas fa-box';
  }
  //</editor-fold>
}

interface SortOption {
  id: string;
  name: string;
}
