import {isString, WithId} from "@consensus-labs/ts-tools";
import {BehaviorSubject, Observable, Observer, of, shareReplay, Subscribable, Unsubscribable} from "rxjs";
import {TreeDataSource} from "./tree-data-source";
import {distinctUntilChanged, map, switchMap} from "rxjs/operators";
import {cache} from "@consensus-labs/rxjs-tools";
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

export class TreeRange<TFolder extends WithId, TItem extends WithId> implements Subscribable<TItem[]> {

  multiple: true = true;

  private _itemIds$ = new BehaviorSubject<string[]>([]);
  itemIds$: Observable<string[]>;
  itemIdLookup$: Observable<Set<string>>;

  items$: Observable<TItem[]>;
  empty$: Observable<boolean>;

  constructor(private dataSource: TreeDataSource<TFolder, TItem>) {

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

    const state$ = this.itemIdLookup$.pipe(
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
    lookup: Set<string>
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

export type AnyTreeSelection<TFolder extends WithId, TItem extends WithId> =
  | TreeSelection<TFolder, TItem>
  | TreeRange<TFolder, TItem>;

type ActiveState = 'none' | 'some' | 'all';
