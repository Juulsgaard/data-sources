import {
  auditTime, BehaviorSubject, combineLatest, delay, EMPTY, firstValueFrom, merge, Observable, Observer, of,
  Subscribable, Unsubscribable
} from "rxjs";
import {distinctUntilChanged, filter, map, skip, switchMap} from "rxjs/operators";
import {BaseTreeFolder, BaseTreeItem, TreeAsideData, TreeFolder, TreeItem} from "./tree-data";
import {TreeDataSource} from "./tree-data-source";
import {WithId} from "@consensus-labs/ts-tools";
import {cache, latestValueFromOrDefault} from "@consensus-labs/rxjs-tools";

export class TreeState<TFolder extends WithId, TItem extends WithId> implements Subscribable<TItem | undefined> {

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

  constructor(private dataSource: TreeDataSource<TFolder, TItem>, folderId$?: Observable<string | undefined>, itemId$?: Observable<string | undefined>) {

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

    // Verify parentId via the cheaper baseItem before looking up the full metaItem
    this.metaItem$ = this.baseItem$.pipe(
      map(x => x?.model.id),
      distinctUntilChanged(),
      switchMap(itemId => !itemId
        ? of(undefined)
        : dataSource.metaItemLookup$.pipe(
          map(x => x.get(itemId))
        )
      ),
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
  setItem(item: BaseTreeItem<TItem> | undefined): boolean {
    if (!item) {
      this._itemId$.next(undefined);
      return true;
    }

    this._folderId$.next(item.folderId);
    this._itemId$.next(item.model.id);
    return true;
  }

  async setItemId(itemId: string | undefined): Promise<boolean> {
    if (!itemId) {
      this._itemId$.next(undefined);
      return true;
    }

    const item = await firstValueFrom(this.dataSource.baseItemLookup$.pipe(
      map(lookup => lookup.get(itemId))
    ));

    if (!item) return false;
    return this.setItem(item);
  }

  //</editor-fold>

  //<editor-fold desc="Set Folder">
  setFolder(folder: BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem> | undefined): boolean {
    return this.setFolderId(folder?.model.id);
  }

  setFolderId(folderId: string | undefined): boolean {
    if (!folderId) {
      this._folderId$.next(undefined);
      this._itemId$.next(undefined);
      return true;
    }

    if (this._folderId$.value === folderId) return false;

    this._folderId$.next(folderId);
    this._itemId$.next(undefined);
    return true;
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

export class TreeItemState<TFolder extends WithId, TItem extends WithId> implements Subscribable<TItem | undefined> {

  private _itemId$ = new BehaviorSubject<string | undefined>(undefined);
  public itemId$: Observable<string | undefined>;
  private _folderId$ = new BehaviorSubject<string | undefined>(undefined);
  public folderId$: Observable<string | undefined>;

  folder$: Observable<TFolder | undefined>;
  baseFolder$: Observable<BaseTreeFolder<TFolder> | undefined>;
  metaFolder$: Observable<TreeFolder<TFolder, TItem> | undefined>;

  item$: Observable<TItem | undefined>;
  baseItem$: Observable<BaseTreeItem<TItem> | undefined>;
  metaItem$: Observable<TreeItem<TFolder, TItem> | undefined>;

  folderChanges$: Observable<TFolder>;
  itemChanges$: Observable<TItem>;

  asideData$: Observable<TreeAsideData<TFolder, TItem>>;

  constructor(private dataSource: TreeDataSource<TFolder, TItem>, itemId$?: Observable<string | undefined>) {

    this.itemId$ = merge(this._itemId$, itemId$ ?? EMPTY).pipe(cache(), distinctUntilChanged());

    //<editor-fold desc="Item Value">
    this.baseItem$ = combineLatest([dataSource.baseItemLookup$, this.itemId$]).pipe(
      map(([lookup, id]) => id ? lookup.get(id) : undefined),
      distinctUntilChanged(),
      cache()
    );

    this.item$ = this.baseItem$.pipe(map(x => x?.model));

    this.metaItem$ = this.itemId$.pipe(
      switchMap(id => !id
        ? of(undefined)
        : dataSource.metaItemLookup$.pipe(map(lookup => lookup.get(id)))
      ),
      distinctUntilChanged(),
      cache()
    );
    //</editor-fold>

    this.folderId$ = this.baseItem$.pipe(
      switchMap(x => x ? of(x.folderId) : this._folderId$),
      distinctUntilChanged(),
      cache()
    );

    this.asideData$ = dataSource.getSidebarData(this.folderId$);

    //<editor-fold desc="Folder Values">
    this.baseFolder$ = combineLatest([dataSource.baseFolderLookup$, this.folderId$]).pipe(
      map(([lookup, id]) => id ? lookup.get(id) : undefined),
      distinctUntilChanged(),
      cache()
    );

    this.folder$ = this.baseFolder$.pipe(map(x => x?.model));

    this.metaFolder$ = this.folderId$.pipe(
      switchMap(id => !id
        ? of(undefined)
        : dataSource.metaFolderLookup$.pipe(map(lookup => lookup.get(id)))
      ),
      distinctUntilChanged(),
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
    //</editor-fold>
  }

  subscribe(observer: Partial<Observer<TItem | undefined>>): Unsubscribable {
    return this.item$.subscribe(observer);
  }

  //<editor-fold desc="Set Item">
  setItem(item: BaseTreeItem<TItem> | undefined): boolean {
    return this.setItemId(item?.model.id);
  }

  setItemId(itemId: string | undefined): boolean {
    if (itemId) {
      this._itemId$.next(itemId);
      this._folderId$.next(undefined);
      return true;
    }

    const currentFolderId = latestValueFromOrDefault(this.folderId$);
    this._itemId$.next(itemId);
    this._folderId$.next(currentFolderId);
    return true;
  }

  //</editor-fold>

  //<editor-fold desc="Set Folder">
  setFolder(folder: BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem> | undefined): boolean {
    return this.setFolderId(folder?.model.id);
  }

  setFolderId(folderId: string | undefined): boolean {
    if (!folderId) {
      this._folderId$.next(undefined);
      this._itemId$.next(undefined);
      return true;
    }

    const currentFolderId = latestValueFromOrDefault(this.folderId$);
    if (folderId === currentFolderId) return false;
    this._folderId$.next(folderId);
    this._itemId$.next(undefined);
    return true;
  }

  setOnlyFolderId(folderId: string|undefined) {
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
}

export type AnyTreeState<TFolder extends WithId, TItem extends WithId> =
  | TreeState<TFolder, TItem>
  | TreeItemState<TFolder, TItem>;

