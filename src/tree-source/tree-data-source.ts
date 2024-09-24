import {BehaviorSubject, EMPTY, isObservable, Observable, of} from "rxjs";
import {catchError, switchMap} from "rxjs/operators";
import Fuse from "fuse.js";
import {
  BaseTreeFolder, BaseTreeItem, TreeAsideData, TreeAsideFolderData, TreeAsideItemData, TreeDataSourceOptions, TreeFlag,
  TreeFolder, TreeFolderAction, TreeFolderData, TreeFolderSearchData, TreeFolderSearchRowData,
  TreeHiddenSearchColumnConfig, TreeHiddenSortColumnConfig, TreeItem, TreeItemAction, TreeItemData, TreeItemSearchData,
  TreeItemSearchRowData, TreeRowConfig, TreeSearchColumnConfig, TreeSearchConfig, TreeSearchData, TreeSearchRowData,
  TreeSortConfig
} from "./tree-data";
import {ITreeFolderFilterState, ITreeItemFilterState} from "../filtering/filter-service";
import {DetachedSearchData} from "../models/detached-search";
import {
  applySelector, arrToLookup, arrToMap, mapArrNotNull, mapToArr, SimpleObject, SortFn, titleCase, WithId
} from "@juulsgaard/ts-tools";
import {Sort} from "../lib/types";
import {
  assertInInjectionContext, computed, DestroyRef, effect, EffectRef, inject, Injector, isSignal, signal, Signal,
  untracked
} from "@angular/core";
import {ListDataSource} from "../list-source/list-data-source";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {searchSignal} from "@juulsgaard/signal-tools";

export class TreeDataSource<TFolder extends WithId, TItem extends WithId> {

  //<editor-fold desc="Outputs">
  readonly treeData: Signal<TreeFolderData<TFolder, TItem>[]>;

  readonly searchResult: Signal<TreeSearchRowData<TFolder, TItem>[]>;
  readonly folderSearchResult: Signal<TreeFolderSearchRowData<TFolder, TItem>[]>;
  readonly itemSearchResult: Signal<TreeItemSearchRowData<TFolder, TItem>[]>;

  //</editor-fold>

  //<editor-fold desc="Lookups">
  readonly baseFolders: Signal<BaseTreeFolder<TFolder>[]>;
  readonly metaFolders: Signal<TreeFolder<TFolder, TItem>[]>;

  readonly folderLookup: Signal<Map<string, TFolder>>;
  readonly baseFolderLookup: Signal<Map<string, BaseTreeFolder<TFolder>>>;
  readonly metaFolderLookup: Signal<Map<string, TreeFolder<TFolder, TItem>>>;

  readonly filteredFolders: Signal<BaseTreeFolder<TFolder>[]>;
  readonly filteredMetaFolders: Signal<TreeFolder<TFolder, TItem>[]>;
  readonly filteredMetaFolderLookup: Signal<Map<string, TreeFolder<TFolder, TItem>>>;


  readonly baseItems: Signal<BaseTreeItem<TItem>[]>;
  readonly metaItems: Signal<TreeItem<TFolder, TItem>[]>;

  readonly itemLookup: Signal<Map<string, TItem>>;
  readonly baseItemLookup: Signal<Map<string, BaseTreeItem<TItem>>>;
  readonly metaItemLookup: Signal<Map<string, TreeItem<TFolder, TItem>>>;

  readonly filteredItems: Signal<BaseTreeItem<TItem>[]>;
  readonly filteredMetaItems: Signal<TreeItem<TFolder, TItem>[]>;
  readonly filteredMetaItemLookup: Signal<Map<string, TreeItem<TFolder, TItem>>>;

  //</editor-fold>

  readonly columns: TreeSearchColumnConfig<TFolder, any, TItem, any>[];
  readonly sortOptions: SortOption[] = [];
  readonly hiddenSortOptions: SortOption[] = [];

  private sortLookup = new Map<string, TreeSortConfig<TFolder, TItem, unknown>>();
  private searchConfigs = new Map<string, TreeSearchConfig<TFolder, TItem>>();

  readonly hasActions: boolean;

  private readonly onDestroy: DestroyRef;

  constructor(
    private readonly options: TreeDataSourceOptions<TFolder, TItem>,
    private readonly searchColumns: TreeSearchColumnConfig<TFolder, any, TItem, any>[],
    private readonly hiddenSearchColumn: TreeHiddenSearchColumnConfig<TFolder, TItem>[],
    private readonly hiddenSortColumns: TreeHiddenSortColumnConfig<TFolder, TItem, any>[],
    private readonly treeConfig?: TreeRowConfig<TFolder, TItem>,
    private readonly injector?: Injector
  ) {

    if (!options.itemParentId && !options.folderChildren) {
      throw Error('Tree Data Source need either itemParentId or folderChildren defined');
    }

    if (!this.injector) assertInInjectionContext(ListDataSource);

    this.onDestroy = this.injector?.get(DestroyRef) ?? inject(DestroyRef);

    //<editor-fold desc="Initialise">

    this.hasActions = !!options.folderActions.length || !!options.itemActions.length;

    this.columns = [...searchColumns];

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
    this.folderFilterState = this.options.folderFilterService?.filter ?? signal(undefined);

    const folderFilterActive = computed(() => {
      const activeCount = this.options.folderFilterService?.activeFilters() ?? 0;
      return activeCount > 0;
    });

    this.folderFilterActive = computed(() => this.folderBlacklist().length > 0 || folderFilterActive());


    // Item Filter
    this.itemFilterState = this.options.itemFilterService?.filter ?? signal(undefined);

    const itemFilterActive = computed(() => {
      const activeCount = this.options.itemFilterService?.activeFilters() ?? 0;
      return activeCount > 0;
    });

    this.itemFilterActive = computed(() => this.itemBlacklist().length > 0 || itemFilterActive());

    // </editor-fold>

    //<editor-fold desc="Build Pipeline">

    //<editor-fold desc="Base Lists">

    // Folders
    if (options.folderParentId) {
      const folderParentId = options.folderParentId;

      this.baseFolders = computed(() => this.folders().map(folder => ({
        model: folder,
        parentId: applySelector(folder, folderParentId)
      })));

    } else {

      this.baseFolders = computed(() => this.folders().map(folder => ({
        model: folder
      })));

    }

    // Items
    if (options.folderChildren) {
      const folderChildren = options.folderChildren;

      this.items = computed(() => this.folders().flatMap(
        folder => applySelector(folder, folderChildren)
      ));

      this.baseItems = computed(() => this.folders().flatMap(
        folder => applySelector(folder, folderChildren)
          .map(item => ({folderId: folder.id, model: item}))
      ));

    } else if (options.itemParentId) {
      const itemParentId = options.itemParentId;

      this.items = this.itemsIn;
      this.baseItems = computed(() => this.itemsIn().map(item => ({
        folderId: applySelector(item, itemParentId),
        model: item
      })));

    } else {
      throw Error("Invalid state");
    }
    //</editor-fold>

    //<editor-fold desc="Lookups">
    this.folderLookup = computed(() => arrToMap(this.folders(), x => x.id));
    this.itemLookup = computed(() => arrToMap(this.items(), x => x.id));

    this.baseFolderLookup = computed(() => arrToMap(this.baseFolders(), x => x.model.id));
    this.baseItemLookup = computed(() => arrToMap(this.baseItems(), x => x.model.id));

    // Nest data for lookups
    const nestedLookupData = computed(() => this.nestData(this.baseFolders(), this.baseItems()));

    this.metaFolders = computed(() => nestedLookupData().folders);
    this.metaItems = computed(() => nestedLookupData().items);

    this.metaFolderLookup = computed(() => arrToMap(this.metaFolders(), x => x.model.id));
    this.metaItemLookup = computed(() => arrToMap(this.metaItems(), x => x.model.id));
    //</editor-fold>


    // Filtering
    this.filteredFolders = computed(() => this.filterFolders(this.baseFolders()));
    this.filteredItems = computed(() => this.filterItems(this.baseItems()));

    // Apply Nesting
    const nestedData = computed(() => this.nestData(this.filteredFolders(), this.filteredItems()));

    this.filteredMetaFolders = computed(() => nestedData().folders);
    this.filteredMetaFolderLookup = computed(() => arrToMap(this.filteredMetaFolders(), x => x.model.id));

    this.filteredMetaItems = computed(() => nestedData().items);
    this.filteredMetaItemLookup = computed(() => arrToMap(this.filteredMetaItems(), x => x.model.id));

    // Tree Output
    this.treeData = computed(() => this.mapToTree(this.filteredMetaFolders()));

    //Search Query
    const query = searchSignal(this.searchQuery, 1000, 300, {injector: this.injector});
    this.searching = computed(() => !!query()?.length);

    // Search Data
    this.preSearchFolders = computed(() => this.mapFoldersForSearch(this.filteredMetaFolders()));
    this.folderSearcher = computed(() => this.getFolderSearcher(this.preSearchFolders()));

    this.preSearchItems = computed(() => this.mapItemsForSearch(this.filteredMetaItems()));
    this.itemSearcher = computed(() => this.getItemSearcher(this.preSearchItems()));

    // Searching
    const folderSearchData = computed(() => this.searchFolders(query()));
    const itemSearchData = computed(() => this.searchItems(query()));

    // Merge Search
    const mergedSearchData = computed(
      () => [...folderSearchData(), ...itemSearchData()]
        .sort((a, b) => (a?.score ?? 0) - (b?.score ?? 0))
        .map(x => x.item)
    );

    // Sorting
    this.searchResult = computed(
      () => this.mapSearchRows(
        this.sortRows(mergedSearchData())
      )
    );

    this.folderSearchResult = computed(
      () => this.mapSearchRows(
        this.sortRows(folderSearchData().map(x => x.item))
      ) as TreeFolderSearchRowData<TFolder, TItem>[]
    );

    this.itemSearchResult = computed(
      () => this.mapSearchRows(
        this.sortRows(itemSearchData().map(x => x.item))
      ) as TreeItemSearchRowData<TFolder, TItem>[]
    );

    //</editor-fold>

    // Map observable folders to folder signal
    this.folderSources$.pipe(
      switchMap(x => x ?? EMPTY),
      takeUntilDestroyed(this.onDestroy),
      catchError(() => of([] as TFolder[]))
    ).subscribe(val => this._folders.set(val));

    effect(() => {
      const source = this.folderSources();
      if (!source) return;
      this._folders.set(source());
    }, {injector: this.injector, allowSignalWrites: true});

    // Map observable items to item signal
    this.itemSources$.pipe(
      switchMap(x => x ?? EMPTY),
      takeUntilDestroyed(this.onDestroy),
      catchError(() => of([] as TItem[]))
    ).subscribe(val => this._itemsIn.set(val));

    effect(() => {
      const source = this.itemSources();
      if (!source) return;
      this._itemsIn.set(source());
    }, {injector: this.injector, allowSignalWrites: true});
  }

  //<editor-fold desc="Folder Population">
  private readonly _folders = signal<TFolder[]>([]);
  private readonly folderSources = signal<Signal<TFolder[]>|undefined>(undefined);
  private readonly folderSources$ = new BehaviorSubject<Observable<TFolder[]>|undefined>(undefined);

  public readonly folders: Signal<TFolder[]> = this._folders.asReadonly();
  public readonly folderCount = computed(() => this.folders().length);
  public readonly foldersEmpty = computed(() => this.folderCount() <= 0);

  private folderEffectRef?: EffectRef;

  /**
   * Populate the folder list
   * @param folders
   */
  setFolders(folders: TFolder[]): void;
  /**
   * Populate the folder list via signal
   * @param folders
   */
  setFolders(folders: Signal<TFolder[]>): void;
  /**
   * Populate the folder list via observable
   * @param folders$
   */
  setFolders(folders$: Observable<TFolder[]>): void;
  setFolders(folders: TFolder[] | Signal<TFolder[]> | Observable<TFolder[]>): void {

    if (isSignal(folders)) {
      this.folderSources.set(folders);
      return;
    }

    if (isObservable(folders)) {
      this.folderSources$.next(folders);
      return;
    }

    this._folders.set(folders);
  }

  /**
   * Trigger a re-calculation of the folder data source pipeline
   */
  recalculateFolders() {
    this._folders.set([...untracked(this.folders)]);
  }

  //</editor-fold>

  //<editor-fold desc="Item Population">
  private readonly _itemsIn = signal<TItem[]>([]);
  private readonly itemSources = signal<Signal<TItem[]>|undefined>(undefined);
  private readonly itemSources$ = new BehaviorSubject<Observable<TItem[]>|undefined>(undefined);

  public readonly itemsIn: Signal<TItem[]> = this._itemsIn.asReadonly();
  public readonly items: Signal<TItem[]>;
  public readonly itemCount = computed(() => this.items().length);
  public readonly itemsEmpty = computed(() => this.itemCount() <= 0);

  private itemEffectRef?: EffectRef;

  /**
   * Populate the item list
   * @param items
   */
  setItems(items: TItem[]): void;
  /**
   * Populate the item list via signal
   * @param items
   */
  setItems(items: Signal<TItem[]>): void;
  /**
   * Populate the item list via observable
   * @param items$
   */
  setItems(items$: Observable<TItem[]>): void;
  setItems(items: TItem[] | Signal<TItem[]> | Observable<TItem[]>): void {

    if (isSignal(items)) {
     this.itemSources.set(items);
      return;
    }

    if (isObservable(items)) {
      this.itemSources$.next(items);
      return;
    }

    this._itemsIn.set(items);
  }

  /**
   * Trigger a re-calculation of the item data source pipeline
   */
  recalculateItems() {
    this._itemsIn.set([...untracked(this.itemsIn)]);
  }

  //</editor-fold>

  //<editor-fold desc="Filtering">
  private readonly folderFilterState: Signal<ITreeFolderFilterState<TFolder> | undefined>;
  private readonly itemFilterState: Signal<ITreeItemFilterState<TItem> | undefined>;

  private folderBlacklist = signal<string[]>([]);
  private itemBlacklist = signal<string[]>([]);

  public readonly folderFilterActive: Signal<boolean>;
  public readonly itemFilterActive: Signal<boolean>;

  /**
   * Define a list of Item Ids that will be removed from the final result
   * @param ids
   */
  setItemBlackList(ids: string[] | undefined) {
    this.itemBlacklist.set(ids ?? []);
  }

  /**
   * Define a list of Folder Ids that will be removed from the final result
   * @param ids
   */
  setFolderBlackList(ids: string[] | undefined) {
    this.folderBlacklist.set(ids ?? []);
  }

  /**
   * Filters a list of DeepFolders
   * @param list - Folders
   * @return folders - A filtered list of folders
   * @private
   */
  private filterFolders(
    list: BaseTreeFolder<TFolder>[]
  ): BaseTreeFolder<TFolder>[] {
    if (list.length <= 0) return list;

    const blacklist = this.folderBlacklist();
    if (blacklist?.length) {
      const set = new Set<string>(blacklist);
      list = list.filter(x => !set.has(x.model.id));
    }

    const filter = this.folderFilterState();
    if (!filter) return list;
    return filter.filter(list);
  }

  /**
   * Filters a list of Items
   * @param list - List of Items
   * @return items - Filtered list of Items
   * @private
   */
  private filterItems(
    list: BaseTreeItem<TItem>[]
  ): BaseTreeItem<TItem>[] {
    if (list.length <= 0) return list;

    const blacklist = this.itemBlacklist();
    if (blacklist?.length) {
      const set = new Set<string>(blacklist);
      list = list.filter(x => !set.has(x.model.id));
    }

    const filter = this.itemFilterState();
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

    const root = folderLookup.get(undefined) ?? [];

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
    return mapArrNotNull(
      this.options.folderActions,
      (config): TreeFolderAction<TFolder, TItem>|undefined => {
        if (!config.action && !config.route) return undefined;
        if (config.filter && !config.filter(folder.model, folder)) return undefined;

        if (config.route === undefined) {
          return config as TreeFolderAction<TFolder, TItem>;
        }

        return {name: config.name, icon: config.icon, color: config.color, newTab: !!config.newTab, route: config.route(folder.model, folder)};
      }
    );
  }

  private mapItemActions(item: TreeItem<TFolder, TItem>): TreeItemAction<TFolder, TItem>[] {
    return mapArrNotNull(
      this.options.itemActions,
      (config): TreeItemAction<TFolder, TItem>|undefined => {
        if (!config.action && !config.route) return undefined;
        if (config.filter && !config.filter(item.model, item)) return undefined;

        if (config.route === undefined) {
          return config as TreeItemAction<TFolder, TItem>;
        }

        return {name: config.name, icon: config.icon, color: config.color, newTab: !!config.newTab, route: config.route(item.model, item)};
      }
    );
  }

  //</editor-fold>

  //<editor-fold desc="Flag Mapping">

  private mapFolderFlags(folder: TreeFolder<TFolder, TItem>): TreeFlag[] {
    return mapArrNotNull(
      this.options.folderFlags,
      (config): TreeFlag | undefined => {

        const active = !config.filter || config.filter(folder.model, folder);

        if (active) return {name: config.name, icon: config.icon};

        if (!config.inactiveIcon) return undefined;
        return {name: config.inactiveName ?? config.name, icon: config.inactiveIcon};
      }
    );
  }

  private mapItemFlags(item: TreeItem<TFolder, TItem>): TreeFlag[] {
    return mapArrNotNull(
      this.options.itemFlags,
      (config): TreeFlag | undefined => {

        const active = !config.filter || config.filter(item.model, item);

        if (active) return {name: config.name, icon: config.icon};

        if (!config.inactiveIcon) return undefined;
        return {name: config.inactiveName ?? config.name, icon: config.inactiveIcon};
      }
    );
  }

  //</editor-fold>

  //<editor-fold desc="Sidebar Data">

  public getSidebarData(folderId: Signal<string|undefined>): Signal<TreeAsideData<TFolder, TItem>> {
    return computed(() => this.mapSidebarData(folderId()));
  }

  private mapSidebarData(folderId: string|undefined): TreeAsideData<TFolder, TItem> {

    const folder = folderId ? this.filteredMetaFolderLookup().get(folderId) : undefined;
    if (!folder) return this.mapSidebarRoot();

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
      flags: this.mapFolderFlags(folder),
      path
    }
  }

  private mapSidebarRoot(): TreeAsideData<TFolder, TItem> {

    const folders = this.filteredMetaFolders()
      .filter(folder => folder.parentId == undefined)
      .map(folder => this.mapSidebarFolder(folder));

    return {
      model: undefined,
      name: 'Root',
      icon: folders.length > 0 ? 'fad fa-folder' : 'fad fa-folder-blank',
      folders,
      items: [],
      actions: [],
      flags: [],
      path: []
    }
  }

  private mapSidebarFolder(folder: TreeFolder<TFolder, TItem>): TreeAsideFolderData<TFolder, TItem> {
    return {
      model: folder,
      name: this.treeConfig?.folderName(folder.model, folder) ?? 'N/A',
      bonus: this.treeConfig?.folderBonus?.(folder.model, folder),
      icon: this.getFolderIcon(folder),
      actions: this.mapFolderActions(folder),
      flags: this.mapFolderFlags(folder)
    };
  }

  private mapSidebarItem(item: TreeItem<TFolder, TItem>): TreeAsideItemData<TFolder, TItem> {
    return {
      model: item,
      name: this.treeConfig?.itemName(item.model, item) ?? 'N/A',
      bonus: this.treeConfig?.itemBonus?.(item.model, item),
      icon: this.getItemIcon(item),
      actions: this.mapItemActions(item),
      flags: this.mapItemFlags(item)
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
      flags: this.mapFolderFlags(folder),
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
      flags: this.mapItemFlags(item),
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
  private mapFoldersForSearch(folders: TreeFolder<TFolder, TItem>[]): TreeFolderSearchData<TFolder, TItem>[] {

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
  private mapItemsForSearch(items: TreeItem<TFolder, TItem>[]): TreeItemSearchData<TFolder, TItem>[] {

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
          actions: this.mapFolderActions(row.model),
          flags: this.mapFolderFlags(row.model)
        };
      }

      return {
        ...row, data,
        actions: this.mapItemActions(row.model),
        flags: this.mapItemFlags(row.model)
      };
    });

  }

  //</editor-fold>

  //<editor-fold desc="Search">
  readonly searchQuery = signal<string | undefined>(undefined);

  private readonly preSearchFolders: Signal<TreeFolderSearchData<TFolder, TItem>[]>;
  private _folderSearcher?: Fuse<TreeFolderSearchData<TFolder, TItem>>;
  private readonly folderSearcher: Signal<Fuse<TreeFolderSearchData<TFolder, TItem>>>;

  private readonly preSearchItems: Signal<TreeItemSearchData<TFolder, TItem>[]>;
  private _itemSearcher?: Fuse<TreeItemSearchData<TFolder, TItem>>;
  private readonly itemSearcher: Signal<Fuse<TreeItemSearchData<TFolder, TItem>>>;

  private searchResultLimit = 100;

  searching: Signal<boolean>;

  public clearSearch() {
    this.searchQuery.set(undefined);
  }

  /**
   * Register Folders for Fuzzy Search
   * @param folders - Folder search data
   * @private
   */
  private getFolderSearcher(folders: TreeFolderSearchData<TFolder, TItem>[]) {

    if (this._folderSearcher) {
      this._folderSearcher.setCollection(folders);
      return this._folderSearcher;
    }

    this._folderSearcher = new Fuse<TreeFolderSearchData<TFolder, TItem>>(folders, {
      includeScore: true,
      shouldSort: true,
      keys: mapToArr(this.searchConfigs, (col, key) => ({key, col}))
        .filter(({col}) => !!col.mapFolder)
        .map(({key, col}) => ({
          name: ['search', key],
          weight: col.weight ?? 1
        }))
    });

    return this._folderSearcher;
  }

  /**
   * Register Items for Fuzzy Search
   * @param items - Item search data
   * @private
   */
  private getItemSearcher(items: TreeItemSearchData<TFolder, TItem>[]) {

    if (this._itemSearcher) {
      this._itemSearcher.setCollection(items);
      return this._itemSearcher;
    }

    this._itemSearcher = new Fuse<TreeItemSearchData<TFolder, TItem>>(items, {
      includeScore: true,
      shouldSort: true,
      keys: mapToArr(this.searchConfigs, (val, key) => ({key, val}))
        .filter(({val}) => !!val.mapItem)
        .map(({key}) => ['search', key])
    });

    return this._itemSearcher;
  }

  /**
   * Search folders
   * @param query - Search Query
   * @param limit
   * @return folders - Folders that match the search query
   * @private
   */
  private searchFolders(query: string|undefined, limit?: number) {
    if (!query) return [];
    return this.folderSearcher()!.search(query, {limit: limit ?? this.searchResultLimit});
  }

  /**
   * Search items
   * @param query - Search Query
   * @param limit
   * @return items - Items that match the search query
   * @private
   */
  private searchItems(query: string|undefined, limit?: number) {
    if (!query) return [];
    return this.itemSearcher().search(query, {limit: limit ?? this.searchResultLimit});
  }

  //</editor-fold>

  //<editor-fold desc="Detached Search">

  /**
   * Generate a detached search feed with a dedicated query for Folders
   * @param searchQuery - The dedicated query (should be throttled if coming from user input)
   * @param limit - Limit the amount of search results
   */
  getDetachedFolderSearch(searchQuery: Signal<string>, limit = 20): Signal<DetachedSearchData<TreeFolder<TFolder, TItem>>[]> {
    return computed(() => {

      const query = searchQuery();
      if (!query) return [];

      const result = this.folderSearcher().search(query ?? '', {limit});
      return result.map(({item, score}) => (
        {
          id: item.model.model.id,
          model: item.model,
          name: this.treeConfig?.folderName(item.model.model, item.model) ?? 'N/A',
          icon: this.getFolderIcon(item.model),
          extra: this.treeConfig?.folderBonus?.(item.model.model, item.model),
          score: score ?? 0
        } satisfies DetachedSearchData<TreeFolder<TFolder, TItem>>
      ));
    });
  }

  /**
   * Generate a detached search feed with a dedicated query for Items
   * @param searchQuery - The dedicated query (should be throttled if coming from user input)
   * @param limit - Limit the amount of search results
   */
  getDetachedItemSearch(searchQuery: Signal<string>, limit = 20): Signal<DetachedSearchData<TreeItem<TFolder, TItem>>[]> {
    return computed(() => {

      const query = searchQuery();
      if (!query) return [];

      const result = this.itemSearcher().search(query ?? '', {limit});
      return result.map(({item, score}) => (
        {
          id: item.model.model.id,
          model: item.model,
          name: this.treeConfig?.itemName(item.model.model, item.model) ?? 'N/A',
          icon: this.getItemIcon(item.model),
          extra: this.treeConfig?.itemBonus?.(item.model.model, item.model),
          score: score ?? 0
        } satisfies DetachedSearchData<TreeItem<TFolder, TItem>>
      ));
    });
  }

  //</editor-fold>

  //<editor-fold desc="Sorting">
  private static readonly defaultSorting: Sort = {active: '', direction: 'asc'};
  private readonly _sorting = signal(TreeDataSource.defaultSorting);
  private readonly sorting = this._sorting.asReadonly();

  /**
   * Sort search results
   * @param list - Merged tree search results
   * @return sortedList - Sorted search results
   * @private
   */
  private sortRows(list: TreeSearchData<TFolder, TItem>[]): TreeSearchData<TFolder, TItem>[] {
    if (!list.length) return list;

    const sort = this.sorting();
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
    this._sorting.set(sort);
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
