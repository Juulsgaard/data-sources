import {asyncScheduler, BehaviorSubject, EMPTY, from, Observable, shareReplay, Subscription} from "rxjs";
import {catchError, distinctUntilChanged, map, skip, throttleTime} from "rxjs/operators";
import {BaseTreeFolder, BaseTreeItem} from "../tree-source/tree-data";
import {deepCopy} from "@consensus-labs/ts-tools";
import {FilterAdapter, FilterReadState, FilterSaveState, MappedReadState} from "./filter-adapter";
import {DataFilter, IndividualDataFilter} from "./data-filter";
import {cache} from "@consensus-labs/rxjs-tools";

export class FilterServiceState<TFilter, TModel> {

  private readonly filterState: TFilter;

  constructor(filterState: TFilter, private readonly filters: DataFilter<TFilter, TModel>[]) {
    this.filterState = deepCopy(filterState);
  }

  filter(list: TModel[]) {
    for (let f of this.filters) {
      list = f.filter(this.filterState, list);
    }
    return list;
  }
}

export type TreeFolderFilterState<TFilter, TFolder> = FilterServiceState<TFilter, BaseTreeFolder<TFolder>>;
export type TreeItemFilterState<TFilter, TItem> = FilterServiceState<TFilter, BaseTreeItem<TItem>>;

export abstract class FilterService<TFilter, TModel> {

  private _filters: DataFilter<TFilter, TModel>[] = [];

  filter$: Observable<FilterServiceState<TFilter, TModel>>;
  activeFilters$: Observable<number>;

  private readonly _resetState: TFilter;

  private _state$: BehaviorSubject<TFilter>;
  public state$: Observable<TFilter>;

  get state() {
    return this._state$.value
  }

  set state(state: TFilter) {
    this._state$.next(state)
  }

  set delta(state: Partial<TFilter>) {
    this.state = {...this.state, ...state}
  };

  protected constructor(state: TFilter, private saveAdapter?: FilterAdapter) {
    this._resetState = deepCopy(state);
    this._state$ = new BehaviorSubject(state);
    this.state$ = this._state$.asObservable();

    this.activeFilters$ = this.state$.pipe(
      throttleTime(200, asyncScheduler, {leading: true, trailing: false}),
      map(state => this._filters.reduce((acc, x) => x.isActive(state) ? acc + 1 : acc, 0)),
      cache()
    );

    this.filter$ = this.state$.pipe(
      throttleTime(500, asyncScheduler, {leading: true, trailing: false}),
      map(state => new FilterServiceState<TFilter, TModel>(state, this._filters)),
      cache()
    );
  }

  protected addFullFilter(isActive: (filter: TFilter) => boolean, filter: (list: TModel[], filter: TFilter) => TModel[]) {
    this._filters.push(new DataFilter<TFilter, TModel>(filter, isActive));
  }

  protected addFilter(isActive: (filter: TFilter) => boolean, filter: (item: TModel, filter: TFilter) => boolean) {
    this._filters.push(new IndividualDataFilter<TFilter, TModel>(filter, isActive));
  }

  protected update(change: (state: TFilter) => Partial<TFilter>) {
    const result = change(this.state);
    if (this.state === result) return;
    this.delta = result;
  }

  public clearFilter() {
    this.state = deepCopy(this._resetState);
  }

  dispose() {
    this.clearFilter();
    this._serializerSub?.unsubscribe();
  }

  private _serializerSub = new Subscription();

  public withSerializer<TState extends FilterSaveState>(serialize: (filter: TFilter) => TState, deserialize: (state: MappedReadState<TState>) => Partial<TFilter>, subscribe = false) {
    if (!this.saveAdapter) throw Error(`Can't use a filter serializer without an adapter`);

    this.deserialize(deserialize as (state: FilterReadState) => Partial<TFilter>, subscribe).then(() => {

      this._serializerSub.add(this._state$.pipe(
        throttleTime(500, asyncScheduler, {leading: true, trailing: true}),
        map(serialize),
        catchError(err => {
          console.log('Failed to serialize filter', this.constructor.name, err);
          return EMPTY;
        }),
        distinctUntilChanged()
      ).subscribe(state => this.saveAdapter?.writeState(state)));

    });
  }

  private async deserialize(deserialize: (state: FilterReadState) => Partial<TFilter>, subscribe: boolean) {

    await this.saveAdapter!.readState().then(deserialize).then(
      state => this.delta = state,
      err => console.log('Failed to deserialize filter', this.constructor.name, err)
    );

    if (subscribe) {
      this._serializerSub.add(
        this.saveAdapter!.subscribe().pipe(
          skip(1),
          map(deserialize),
          catchError(err => {
            console.log('Failed to deserialize filter', this.constructor.name, err);
            return EMPTY;
          }),
        ).subscribe(state => this.delta = state)
      );
    }
  }
}

export class TreeFolderFilterService<TFilter, TFolder> extends FilterService<TFilter, BaseTreeFolder<TFolder>> {

}

export class TreeItemFilterService<TFilter, TItem> extends FilterService<TFilter, BaseTreeItem<TItem>> {

}
