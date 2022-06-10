import {BehaviorSubject, combineLatest, EMPTY, firstValueFrom, merge, Observable, Observer, Subscribable, Unsubscribable} from "rxjs";
import {distinctUntilChanged, map} from "rxjs/operators";
import {cache} from "../lib/rxjs";
import {WithId} from "../lib/types";
import {isString} from "../lib/type-predicates";

export class ListSelection<TModel> implements Subscribable<TModel|undefined> {

  private _id$ = new BehaviorSubject<string|undefined>(undefined);
  public id$: Observable<string|undefined>;

  public value$: Observable<TModel|undefined>;
  get valueAsync() {return firstValueFrom(this.value$)}

  public empty$: Observable<boolean>;

  constructor(lookup$: Observable<Map<string, TModel>>, id$?: Observable<string | undefined>) {

    this.id$ = merge(this._id$, id$ ?? EMPTY).pipe(cache(), distinctUntilChanged());

    this.value$ = combineLatest([lookup$, this.id$]).pipe(
      map(([lookup, id]) => id ? lookup.get(id) : undefined),
      cache()
    );

    this.empty$ = this.value$.pipe(map(x => !x));
  }

  subscribe(observer: Partial<Observer<TModel | undefined>>): Unsubscribable {
    return this.value$.subscribe(observer);
  }

  setItem(value: string|WithId|undefined) {
    this._id$.next(!value ? undefined : isString(value) ? value : value.id);
  }

  clear() {
    this.setItem(undefined);
  }

  toggleItem(item: string|WithId) {
    const id = isString(item) ? item : item.id;
    this.setItem(this._id$.value === id ? undefined : id);
  }

}

export class ListRange<TModel> implements Subscribable<TModel[]> {

  private _ids$ = new BehaviorSubject<string[]>([]);
  public ids$: Observable<string[]>;

  public value$: Observable<TModel[]>;
  get valueAsync() {return firstValueFrom(this.value$)}

  public empty$: Observable<boolean>;

  constructor(lookup$: Observable<Map<string, TModel>>) {
    this.ids$ = this._ids$.asObservable();

    this.value$ = combineLatest([lookup$, this._ids$.pipe(distinctUntilChanged())]).pipe(
      map(([lookup, ids]) => ids.map(id => lookup.get(id)!).filter(x => !!x)),
      cache()
    );

    this.empty$ = this.value$.pipe(map(x => !x.length));
  }

  subscribe(observer: Partial<Observer<TModel[]>>): Unsubscribable {
    return this.value$.subscribe(observer);
  }

  setRange(list: string[]|WithId[]) {
    this._ids$.next(list.map(x => isString(x) ? x : x.id));
  }

  clear() {
    this.setRange([]);
  }

  toggleItem(item: string|WithId, state?: boolean) {
    const id = isString(item) ? item : item.id;
    const ids = this._ids$.value;
    const index = ids.indexOf(id);

    if (index < 0) {
      if (state === false) return false;
      this.setRange([...ids, id]);
      return true;
    }

    if (state === true) return false;
    const newIds = [...ids];
    newIds.splice(index, 1);
    this.setRange(newIds);
    return true;
  }

}
