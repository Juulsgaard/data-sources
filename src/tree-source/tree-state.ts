import {
  auditTime, BehaviorSubject, combineLatest, delay, EMPTY, firstValueFrom, merge, Observable, Observer, of, shareReplay, Subscribable, Unsubscribable
} from "rxjs";
import {distinctUntilChanged, filter, map, skip, switchMap} from "rxjs/operators";
import {WithId} from "../lib/types";
import {cache} from "../lib/rxjs";
import {BaseTreeFolder, BaseTreeItem, TreeAsideData, TreeFolder, TreeItem} from "./tree-data";
import {TreeDataSource} from "./tree-data-source";
import {isString} from "../lib/type-predicates";

class BaseTreeState<TFolder extends WithId, TItem extends WithId> {

  public expandAll$ = new BehaviorSubject<boolean>(false);

  private _openFolders$ = new BehaviorSubject<Set<string>>(new Set<string>());
  public openFolders$: Observable<Set<string>>;

  constructor(protected dataSource: TreeDataSource<TFolder, TItem>) {
    this.openFolders$ = this._openFolders$.asObservable();
  }

  //<editor-fold desc="Open Folders">
  /**
   * Opens all folders in the given folder's path
   * @param folder - The starting point
   * @param includeFolder - If true the starting folder will also be expanded
   */
  openFolderPath(folder: TreeFolder<TFolder, TItem>, includeFolder = false) {
    const openFolders = new Set(this._openFolders$.value);

    if (includeFolder) {
      openFolders.add(folder.model.id);
    }

    for (let p of folder.path) {
      openFolders.add(p.model.id);
    }

    this._openFolders$.next(openFolders);
  }

  /**
   * Open a list of folderIds
   * @param folders - FolderIds
   */
  openFolders(folders: string[]) {
    if (!folders.length) return;

    const openFolders = new Set(this._openFolders$.value);

    for (let id of folders) {
      openFolders.add(id);
    }

    this._openFolders$.next(openFolders);
  }

  /**
   * Opens all folders in the given folder's path
   * This method uses a lookup to generate the path from an id
   * @param folderId - Id of starting point
   * @param includeFolder - If true the starting folder will also be expanded
   */
  async openFolderIdPath(folderId: string, includeFolder = false) {
    const path = await this.getFolderIdPath(folderId, includeFolder);
    this.openFolders(path.map(x => x.model.id));
  }

  //</editor-fold>

  //<editor-fold desc="Close Folders">
  /**
   * Closes a folder and ensured that any open sub-folders are also closed
   * @param folder
   */
  closeFolder(folder: TreeFolder<TFolder, TItem>) {
    const openFolders = new Set(this._openFolders$.value);
    this._closeFolder(openFolders, folder);
    this._openFolders$.next(openFolders);
  }

  private _closeFolder(set: Set<string>, folder: TreeFolder<TFolder, TItem>) {
    if (!set.delete(folder.model.id)) return;
    for (let f of folder.folders) {
      this._closeFolder(set, f);
    }
  }

  //</editor-fold>

  /**
   * Toggles the open state of a folder
   * When toggled on the entire path is also opened
   * @param folder - The folder to toggle
   * @param state - Force the added state (True: Always add, False: Always remove)
   */
  toggleOpenFolder(folder: TreeFolder<TFolder, TItem>, state?: boolean) {
    if (this._openFolders$.value.has(folder?.model.id)) {
      if (state === true) return false;
      this.closeFolder(folder);
      return true;
    }

    if (state === false) return false;
    this.openFolderPath(folder, true);
    return true;
  }

  //<editor-fold desc="Open Item Folders">
  /**
   * Open all folders in path for item
   * @param item - The Item
   */
  openItemPath(item: TreeItem<TFolder, TItem>) {
    const openFolders = new Set(this._openFolders$.value);

    openFolders.add(item.folderId);

    for (let p of item.folder.path) {
      openFolders.add(p.model.id);
    }

    this._openFolders$.next(openFolders);
  }

  /**
   * Open all folders in path for item
   * This method uses a lookup to generate the path from an id
   * @param itemId - Id of Item
   */
  async openItemIdPath(itemId: string) {
    const item = await firstValueFrom(this.dataSource.baseItemLookup$.pipe(
      map(lookup => lookup.get(itemId))
    ));

    if (!item) return;
    await this.openFolderIdPath(item.folderId, true);
  }

  //</editor-fold>

  //<editor-fold desc="Set Open Folders">
  /**
   * Overwrite the open folders to only include a single folder, and it's path
   * @param folder - The starting point
   * @param includeFolder - If true the starting folder will also be expanded
   */
  setOpenFolderPath(folder: TreeFolder<TFolder, TItem> | undefined, includeFolder = false) {
    if (!folder) {
      this.closeFolders();
      return;
    }

    const openFolders = new Set<string>();

    if (includeFolder) {
      openFolders.add(folder.model.id);
    }

    for (let p of folder.path) {
      openFolders.add(p.model.id);
    }

    this._openFolders$.next(openFolders);
  }

  /**
   * Overwrite the open folders to be the provided list
   * @param folders - Folders to set as open
   */
  setOpenFolders(folders: string[]) {
    this._openFolders$.next(new Set<string>(folders));
  }

  //</editor-fold>

  private async getFolderIdPath(folderId: string, includeFolder = false) {
    const lookup = await firstValueFrom(this.dataSource.baseFolderLookup$);
    const folder = lookup.get(folderId);
    if (!folder) return [];

    const path = includeFolder ? [folder] : [];
    let parentId = folder.parentId;

    while (parentId) {
      const parent = lookup.get(parentId);
      if (!parent) break;
      path.push(parent);
      parentId = parent.parentId;
    }

    return path.reverse();
  }

  /**
   * Close all folders
   */
  closeFolders() {
    this._openFolders$.next(new Set<string>());
  }

  /**
   * Generate an observable that indicates the open state of a specific folder
   * @param folderId - Folder
   */
  isOpen$(folderId: string) {
    return this.expandAll$.pipe(
      switchMap(b => b
        ? of(true)
        : this.openFolders$.pipe(
          map(folders => folders.has(folderId))
        )
      )
    )
  }
}

export class TreeState<TFolder extends WithId, TItem extends WithId> extends BaseTreeState<TFolder, TItem> implements Subscribable<TItem | undefined> {

  routeNav = false;

  private _folderId$ = new BehaviorSubject<string | undefined>(undefined);
  public folderId$: Observable<string | undefined>;

  private _itemId$ = new BehaviorSubject<string | undefined>(undefined);
  public itemId$: Observable<string | undefined>;

  folder$: Observable<TFolder | undefined>;
  baseFolder$: Observable<BaseTreeFolder<TFolder> | undefined>;
  metaFolder$: Observable<TreeFolder<TFolder, TItem> | undefined>;

  item$: Observable<TItem | undefined>;
  baseItem$: Observable<BaseTreeItem<TItem> | undefined>;
  metaItem$: Observable<TreeItem<TFolder, TItem> | undefined>;

  folderChanges$: Observable<TFolder>;
  itemChanges$: Observable<TItem>;
  navChanges$: Observable<[TFolder, TItem] | [TFolder] | []>;

  asideData$: Observable<TreeAsideData<TFolder, TItem>>;

  constructor(dataSource: TreeDataSource<TFolder, TItem>, folderId$?: Observable<string | undefined>, itemId$?: Observable<string | undefined>) {
    super(dataSource);

    this.folderId$ = merge(this._folderId$, folderId$ ?? EMPTY).pipe(cache(), distinctUntilChanged());
    this.itemId$ = merge(this._itemId$, itemId$ ?? EMPTY).pipe(cache(), distinctUntilChanged());

    this.asideData$ = dataSource.getSidebarData(this.folderId$);

    //<editor-fold desc="Folder Values">
    this.baseFolder$ = combineLatest([dataSource.baseFolderLookup$, this.folderId$]).pipe(
      map(([lookup, id]) => id ? lookup.get(id) : undefined),
      cache()
    );

    this.folder$ = this.baseFolder$.pipe(map(x => x?.model));

    this.metaFolder$ = this.folderId$.pipe(
      switchMap(id => !id
        ? of(undefined)
        : dataSource.metaFolderLookup$.pipe(map(lookup => lookup.get(id)))
      ),
      cache()
    );
    //</editor-fold>

    //<editor-fold desc="Item Values">
    const validatedFolderId$ = this.baseFolder$.pipe(map(x => x?.model.id), distinctUntilChanged());

    const baseItem$ = combineLatest([dataSource.baseItemLookup$, this.itemId$]).pipe(
      map(([lookup, id]) => id ? lookup.get(id) : undefined),
      cache()
    );

    this.baseItem$ = combineLatest([baseItem$, validatedFolderId$]).pipe(
      auditTime(0),
      map(([item, folderId]) => !folderId || !item ? undefined : item.folderId === folderId ? item : undefined),
      cache()
    );

    this.item$ = this.baseItem$.pipe(map(x => x?.model));

    const metaItem$ = combineLatest([dataSource.metaItemLookup$, this.itemId$]).pipe(
      map(([lookup, id]) => id ? lookup.get(id) : undefined),
      cache()
    );

    // Verify parentId on the cheaper baseItem before looking up the full metaItem
    this.metaItem$ = combineLatest([this.itemId$, validatedFolderId$]).pipe(
      switchMap(([id, parentId]) => !id || !parentId
        ? of(undefined)
        : dataSource.baseItemLookup$.pipe(
          map(lookup => lookup.get(id)),
          map(item => item && item.folderId === parentId ? item.model.id : undefined),
        )
      ),
      distinctUntilChanged(),
      switchMap(itemId => !itemId
        ? of(undefined)
        : dataSource.metaItemLookup$.pipe(
          map(x => x.get(itemId))
        )
      ),
      cache()
    );

    this.metaItem$ = combineLatest([metaItem$, validatedFolderId$]).pipe(
      auditTime(0),
      map(([item, folderId]) => !folderId || !item ? undefined : item.folderId === folderId ? item : undefined),
      cache()
    );
    //</editor-fold>

    //<editor-fold desc="Map Change Emitters">
    this.folderChanges$ = this.folder$.pipe(
      distinctUntilChanged(((a, b) => a?.id === b?.id)),
      skip(1),
      filter((x): x is TFolder => !!x),
    );

    this.itemChanges$ = this.item$.pipe(
      distinctUntilChanged(((a, b) => a?.id === b?.id)),
      skip(1),
      filter((x): x is TItem => !!x),
    )

    this.navChanges$ = combineLatest([
      this.folder$.pipe(delay(0)), // Delay to bring to same tick as item$
      this.item$
    ]).pipe(
      auditTime(0),
      distinctUntilChanged((([a1, a2], [b1, b2]) => a1?.id === b1?.id && a2?.id === b2?.id)),
      skip(1),
      map(([a, b]) =>
        a && b ? [a, b] :
          a ? [a] :
            []
      )
    );
    //</editor-fold>
  }

  subscribe(observer: Partial<Observer<TItem | undefined>>): Unsubscribable {
    return this.item$.subscribe(observer);
  }

  //<editor-fold desc="Set Item">
  setItem(item: BaseTreeItem<TItem> | undefined) {
    if (!item) {
      this._itemId$.next(undefined);
      return;
    }

    this._folderId$.next(item.folderId);
    this._itemId$.next(item.model.id);
  }

  async setItemId(itemId: string | undefined) {
    if (!itemId) {
      this._itemId$.next(undefined);
      return;
    }

    const item = await firstValueFrom(this.dataSource.baseItemLookup$.pipe(
      map(lookup => lookup.get(itemId))
    ));

    if (!item) return;
    this.setItem(item);
  }

  //</editor-fold>

  //<editor-fold desc="Set Folder">
  setFolder(folder: BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem> | undefined) {
    if (!folder) {
      this._folderId$.next(undefined);
      this._itemId$.next(undefined);
      return;
    }

    const id = isString(folder) ? folder : folder.model.id;
    if (this._folderId$.value === id) return;

    this._folderId$.next(id);
    this._itemId$.next(undefined);
  }

  setFolderId(folderId: string | undefined) {
    this._folderId$.next(folderId);
  }

  //</editor-fold>

  folderActive$(folderId: string): Observable<boolean> {
    return this.baseFolder$.pipe(map(f => !!f && f.model.id === folderId))
  }

  itemActive$(itemId: string): Observable<boolean> {
    return this.baseItem$.pipe(map(f => !!f && f.model.id === itemId))
  }

  clearItem() {
    this.setItem(undefined);
  }

  clearFolder() {
    this.setFolder(undefined);
  }
}

export class TreeSelection<TFolder extends WithId, TItem extends WithId> extends BaseTreeState<TFolder, TItem> implements Subscribable<TItem | undefined> {

  multiple: false = false;

  private _itemId$ = new BehaviorSubject<string | undefined>(undefined);
  public itemId$: Observable<string | undefined>;
  itemIdLookup$: Observable<Set<string>>;

  item$: Observable<TItem | undefined>;
  empty$: Observable<boolean>;

  constructor(dataSource: TreeDataSource<TFolder, TItem>) {
    super(dataSource);

    this.itemId$ = this._itemId$.pipe(distinctUntilChanged());
    this.itemIdLookup$ = this.itemId$.pipe(map(x => new Set<string>(x ? [x] : [])));

    const baseItem$ = this.itemId$.pipe(
      switchMap(id => !id ? of(undefined) : this.dataSource.baseItemLookup$.pipe(
        map(lookup => lookup.get(id))
      )),
      cache()
    );

    this.item$ = baseItem$.pipe(
      map(x => x?.model)
    );

    this.empty$ = baseItem$.pipe(
      map(x => !x)
    );
  }

  subscribe(observer: Partial<Observer<TItem | undefined>>): Unsubscribable {
    return this.item$.subscribe(observer);
  }

  toggleItem(item: string | WithId, state?: boolean) {
    const id = isString(item) ? item : item?.id;

    if (this._itemId$.value === id) {
      if (state === true) return false;
      this._itemId$.next(undefined);
      return true;
    }

    if (state === false) return false;
    this._itemId$.next(id);
    return true;
  }

  setItem(item: string | WithId | undefined) {
    const id = isString(item) ? item : item?.id;
    this._itemId$.next(id);
  }

  isActive$(folder: WithId | string) {
    const id = isString(folder) ? folder : folder.id;
    return this.itemId$.pipe(
      map(activeId => activeId ? activeId === id : false)
    );
  }
}

export class TreeRange<TFolder extends WithId, TItem extends WithId> extends BaseTreeState<TFolder, TItem> implements Subscribable<TItem[]> {

  multiple: true = true;

  private _itemIds$ = new BehaviorSubject<string[]>([]);
  itemIds$: Observable<string[]>;
  itemIdLookup$: Observable<Set<string>>;

  items$: Observable<TItem[]>;
  empty$: Observable<boolean>;

  constructor(dataSource: TreeDataSource<TFolder, TItem>) {
    super(dataSource);

    this.itemIds$ = this._itemIds$.asObservable();
    this.itemIdLookup$ = this.itemIds$.pipe(
      map(list => new Set<string>(list)),
      cache()
    );

    const baseItems$ = this.itemIds$.pipe(
      switchMap(ids => !ids.length ? of([]) : this.dataSource.baseItemLookup$.pipe(
        map(lookup => ids.map(x => lookup.get(x)).filter((x): x is BaseTreeItem<TItem> => !!x))
      )),
      cache()
    );

    this.items$ = baseItems$.pipe(
      map(list => list.map(x => x.model))
    );

    this.empty$ = baseItems$.pipe(
      map(x => !x.length)
    );
  }

  subscribe(observer: Partial<Observer<TItem[]>>): Unsubscribable {
    return this.items$.subscribe(observer);
  }

  toggleItem(item: string | WithId, state?: boolean) {
    const id = isString(item) ? item : item.id;
    const ids = this._itemIds$.value;
    const index = ids.indexOf(id);

    if (index < 0) {
      if (state === false) return false;
      this._itemIds$.next([...ids, id]);
      return true;
    }

    if (state === true) return false;
    const newIds = [...ids];
    newIds.splice(index, 1);
    this._itemIds$.next(newIds);
    return true;
  }

  setRange(list: string[] | WithId[]) {
    this._itemIds$.next(list.map(x => isString(x) ? x : x.id));
  }

  //<editor-fold desc="Toggle Entire Folder">
  toggleFolder(folder: TreeFolder<TFolder, TItem>, checked: boolean) {
    const set = new Set(this._itemIds$.value);
    this._toggleFolder(folder, checked, set);
    this._itemIds$.next(Array.from(set));
  }

  private _toggleFolder(folder: TreeFolder<TFolder, TItem>, checked: boolean, set: Set<string>) {

    for (let item of folder.items) {
      if (checked) set.add(item.model.id);
      else set.delete(item.model.id);
    }

    for (let subFolder of folder.folders) {
      this._toggleFolder(subFolder, checked, set);
    }
  }

  //</editor-fold>

  //<editor-fold desc="Folder Checkbox State">
  getFolderState$(folder: TreeFolder<TFolder, TItem>): [checked: Observable<boolean>, indeterminate: Observable<boolean>] {
    if (folder.itemCount < 1) return [of(false), of(false)];

    const state$ = this.itemIdLookup$.pipe(
      map(lookup => {
        if (!lookup.size) return 'none';
        return this.getFolderState(lookup.size < folder.itemCount ? 'none' : undefined, folder, lookup);
      }),
      shareReplay({refCount: true, bufferSize: 1})
    );

    return [state$.pipe(map(x => x === 'all')), state$.pipe(map(x => x === 'some'))];
  }

  private getFolderState(state: ActiveState | undefined, folder: TreeFolder<TFolder, TItem>, lookup: Set<string>): ActiveState {

    const itemState = this.getFolderItemState(folder, lookup);
    if (itemState) {
      if (itemState === 'some') return 'some';
      if (!state) state = itemState;
      if (itemState !== state) return 'some';
    }

    for (let subFolder of folder.folders) {
      const subState = this.getFolderState(state, subFolder, lookup);
      if (subState === 'some') return 'some';
      if (!state) state = subState;
      if (subState !== state) return 'some';
    }

    return state!;
  }

  private getFolderItemState(folder: TreeFolder<TFolder, TItem>, lookup: Set<string>): ActiveState | undefined {
    if (!folder.items.length) return undefined;
    let itemState: ActiveState | undefined;

    for (let item of folder.items) {
      if (itemState === undefined) {
        itemState = lookup.has(item.model.id) ? 'all' : 'none';
        continue;
      }

      if (lookup.has(item.model.id)) {
        if (itemState === 'none') return 'some';
      } else {
        if (itemState === 'all') return 'some';
      }
    }

    return itemState!;
  }

  //</editor-fold>

  isActive$(folder: WithId | string) {
    const id = isString(folder) ? folder : folder.id;
    return this.itemIdLookup$.pipe(
      map(lookup => lookup.has(id))
    );
  }
}

export type TreeSelectionState<TFolder extends WithId, TItem extends WithId> = TreeSelection<TFolder, TItem> | TreeRange<TFolder, TItem>;
type ActiveState = 'none' | 'some' | 'all';
