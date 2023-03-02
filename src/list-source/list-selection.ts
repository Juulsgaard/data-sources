import {isString, WithId} from "@consensus-labs/ts-tools";
import {combineLatest, Observable, Observer, Subscribable, Unsubscribable} from "rxjs";
import {ListDataSource} from "./list-data-source";
import {distinctUntilChanged, map} from "rxjs/operators";
import {cache, ObservableSet} from "@consensus-labs/rxjs-tools";
import {ListState} from "./list-state";

export class ListSelection<TModel extends WithId> extends ListState<TModel> {

  public empty$: Observable<boolean>;

  constructor(dataSource: ListDataSource<TModel>) {
    super(dataSource);

    this.empty$ = this.item$.pipe(map(x => !x));
  }

  clear() {
    this.setItem(undefined);
  }

  /**
   * Toggle the item in the selection
   * @param item - The item to toggle
   * @param state - A forced state (`true` = always add, `false` = always delete)
   * @returns The applied change (`true` = item added, `false` = item removed, `undefined` = nothing changed)
   */
  toggleItem(item: string | WithId, state?: boolean): boolean|undefined {
    const id = isString(item) ? item : item.id;

    if (this._itemId$.value === item) {
      if (state === true) return undefined;
      this.setItem(undefined);
      return false;
    }

    if (state === false) return undefined;
    this.setItem(id);
    return true;
  }

  isActive$(folder: WithId | string) {
    const id = isString(folder) ? folder : folder.id;
    return this.itemId$.pipe(
      map(itemId => itemId === id)
    );
  }

}

export class ListRange<TModel> implements Subscribable<TModel[]> {

  private _itemIds$ = new ObservableSet<string>();

  itemIds$ = this._itemIds$.value$;
  get itemIds() {return this._itemIds$.value}

  itemIdArray$ = this._itemIds$.array$;
  get itemIdArray() {return this._itemIds$.array};

  public items$: Observable<TModel[]>;

  public empty$: Observable<boolean>;

  constructor(lookup$: Observable<Map<string, TModel>>) {

    this.items$ = combineLatest([lookup$, this.itemIdArray$.pipe(distinctUntilChanged())]).pipe(
      map(([lookup, ids]) => ids.map(id => lookup.get(id)!).filter(x => !!x)),
      cache()
    );

    this.empty$ = this.items$.pipe(map(x => !x.length));
  }

  subscribe(observer: Partial<Observer<TModel[]>>): Unsubscribable {
    return this.items$.subscribe(observer);
  }

  setRange(list: string[] | WithId[]) {
    this._itemIds$.set(list.map(x => isString(x) ? x : x.id));
  }

  clear() {
    this._itemIds$.clear();
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

  isActive$(folder: WithId | string) {
    const id = isString(folder) ? folder : folder.id;
    return this.itemIds$.pipe(
      map(lookup => lookup.has(id))
    );
  }

  contains(item: WithId | string) {
    const id = isString(item) ? item : item.id;
    return this.itemIds.has(id);
  }

}

export type AnyListSelection<TModel extends WithId> =
  | ListSelection<TModel>
  | ListRange<TModel>;
