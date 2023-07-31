import {isString, WithId} from "@juulsgaard/ts-tools";
import {BehaviorSubject, Observable, Observer, of, shareReplay, Subscribable, Unsubscribable} from "rxjs";
import {TreeDataSource} from "./tree-data-source";
import {distinctUntilChanged, map, switchMap} from "rxjs/operators";
import {cache, ObservableSet} from "@juulsgaard/rxjs-tools";
import {BaseTreeItem, TreeFolder} from "./tree-data";

export class TreeSelection<TFolder extends WithId, TItem extends WithId> implements Subscribable<TItem | undefined> {

  multiple: false = false;

  private _itemId$ = new BehaviorSubject<string | undefined>(undefined);
  public itemId$: Observable<string | undefined>;
  itemIdLookup$: Observable<Set<string>>;

  item$: Observable<TItem | undefined>;
  empty$: Observable<boolean>;

  constructor(private dataSource: TreeDataSource<TFolder, TItem>) {

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

  /**
   * Toggle the item in the selection
   * @param item - The item to toggle
   * @param state - A forced state (`true` = always add, `false` = always delete)
   * @returns The applied change (`true` = item added, `false` = item removed, `undefined` = nothing changed)
   */
  toggleItem(item: string | WithId, state?: boolean): boolean|undefined {
    const id = isString(item) ? item : item?.id;

    if (this._itemId$.value === id) {
      if (state === true) return undefined;
      this._itemId$.next(undefined);
      return false;
    }

    if (state === false) return undefined;
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

export class TreeRange<TFolder extends WithId, TItem extends WithId> implements Subscribable<TItem[]> {

  multiple: true = true;

  private _itemIds$ = new ObservableSet<string>();

  itemIds$ = this._itemIds$.value$;
  get itemIds() {return this._itemIds$.value}

  itemIdArray$ = this._itemIds$.array$;
  get itemIdArray() {return this._itemIds$.array};

  items$: Observable<TItem[]>;
  empty$: Observable<boolean>;

  constructor(private dataSource: TreeDataSource<TFolder, TItem>) {

    const baseItems$ = this.itemIdArray$.pipe(
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

  /**
   * Toggle an item in the selection
   * @param item - The item to toggle
   * @param state - A forced state (`true` = always add, `false` = always delete)
   * @returns The applied change (`true` = item added, `false` = item removed, `undefined` = nothing changed)
   */
  toggleItem(item: string | WithId, state?: boolean): boolean|undefined {
    const id = isString(item) ? item : item.id;
    return this._itemIds$.toggle(id, state);
  }

  setRange(list: string[] | WithId[]) {
    this._itemIds$.set(list.map(x => isString(x) ? x : x.id));
  }

  clear() {
    this._itemIds$.clear();
  }

  //<editor-fold desc="Toggle Entire Folder">
  toggleFolder(folder: TreeFolder<TFolder, TItem>, checked: boolean) {
    this._itemIds$.modify(set => this._toggleFolder(folder, checked, set));
  }

  private _toggleFolder(folder: TreeFolder<TFolder, TItem>, checked: boolean, set: Set<string>) {

    for (let item of folder.items) {
      if (checked) {
        set.add(item.model.id);
      } else {
        set.delete(item.model.id);
      }
    }

    for (let subFolder of folder.folders) {
      this._toggleFolder(subFolder, checked, set);
    }
  }

  //</editor-fold>

  //<editor-fold desc="Folder Checkbox State">
  getFolderState$(folder: TreeFolder<TFolder, TItem>): [checked: Observable<boolean>, indeterminate: Observable<boolean>] {
    if (folder.itemCount < 1) return [of(false), of(false)];

    const state$ = this.itemIds$.pipe(
      map(lookup => {
        if (!lookup.size) return 'none';
        return this.getFolderState(lookup.size < folder.itemCount ? 'none' : undefined, folder, lookup);
      }),
      shareReplay({refCount: true, bufferSize: 1})
    );

    return [state$.pipe(map(x => x === 'all')), state$.pipe(map(x => x === 'some'))];
  }

  private getFolderState(
    state: ActiveState | undefined,
    folder: TreeFolder<TFolder, TItem>,
    lookup: ReadonlySet<string>
  ): ActiveState {

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

  private getFolderItemState(folder: TreeFolder<TFolder, TItem>, lookup: ReadonlySet<string>): ActiveState | undefined {
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

  isActive$(item: WithId | string) {
    const id = isString(item) ? item : item.id;
    return this.itemIds$.pipe(
      map(lookup => lookup.has(id))
    );
  }

  contains(item: WithId | string) {
    const id = isString(item) ? item : item.id;
    return this.itemIds.has(id);
  }
}

export type AnyTreeSelection<TFolder extends WithId, TItem extends WithId> =
  | TreeSelection<TFolder, TItem>
  | TreeRange<TFolder, TItem>;

type ActiveState = 'none' | 'some' | 'all';
