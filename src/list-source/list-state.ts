import {BehaviorSubject, combineLatest, EMPTY, merge, Observable, Observer, Subscribable, Unsubscribable} from "rxjs";
import {distinctUntilChanged, map} from "rxjs/operators";
import {cache} from "@juulsgaard/rxjs-tools";
import {isString, WithId} from "@juulsgaard/ts-tools";
import {ListDataSource} from "./list-data-source";

export class ListState<TModel extends WithId> implements Subscribable<TModel | undefined> {

  protected _itemId$ = new BehaviorSubject<string | undefined>(undefined);
  public itemId$: Observable<string | undefined>;

  public item$: Observable<TModel | undefined>;

  constructor(dataSource: ListDataSource<TModel>, id$?: Observable<string | undefined>) {

    const lookup$ = dataSource.itemLookup$;

    this.itemId$ = merge(this._itemId$, id$ ?? EMPTY).pipe(cache(), distinctUntilChanged());

    this.item$ = combineLatest([lookup$, this.itemId$]).pipe(
      map(([lookup, id]) => id ? lookup.get(id) : undefined),
      cache()
    );
  }

  subscribe(observer: Partial<Observer<TModel | undefined>>): Unsubscribable {
    return this.item$.subscribe(observer);
  }

  setItem(value: string | WithId | undefined) {
    const id = isString(value) ? value : value?.id;
    this._itemId$.next(id);
  }
}

