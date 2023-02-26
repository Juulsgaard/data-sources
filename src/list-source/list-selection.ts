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

  toggleItem(item: string | WithId, state?: boolean) {
    const id = isString(item) ? item : item.id;

    if (this._itemId$.value === item) {
      if (state === true) return;
      this.setItem(undefined);
      return;
    }

    if (state === false) return;
    this.setItem(id);
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
  public itemIds$ = this._itemIds$.value$;
  public itemIdArray$ = this._itemIds$.array$;

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

  toggleItem(item: string | WithId, state?: boolean) {
    const id = isString(item) ? item : item.id;
    this._itemIds$.toggle(id, state);
  }

  isActive$(folder: WithId | string) {
    const id = isString(folder) ? folder : folder.id;
    return this.itemIds$.pipe(
      map(lookup => lookup.has(id))
    );
  }

}

export type AnyListSelection<TModel extends WithId> =
  | ListSelection<TModel>
  | ListRange<TModel>;
