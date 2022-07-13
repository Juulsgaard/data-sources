import {asyncScheduler, BehaviorSubject, Observable, Subscription} from "rxjs";
import {distinctUntilChanged, map, throttleTime} from "rxjs/operators";
import {BaseTreeFolder, BaseTreeItem} from "../tree-source/tree-data";
import {deepCopy} from "@consensus-labs/ts-tools";
import {FilterAdapter, FilterSaveState} from "./filter-adapter";

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

    private _filter$ = new BehaviorSubject<FilterServiceState<TFilter, TModel> | undefined>(undefined);
    get filter$() {
        return this._filter$.pipe(throttleTime(1000, asyncScheduler, {leading: true, trailing: true}));
    }

    private _activeFilters$ = new BehaviorSubject(0);
    get activeFilters(): number {
        return this._filters.reduce((acc, x) => x.isActive(this.state) ? acc + 1 : acc, 0);
    }
    get activeFilters$() {
        return this._activeFilters$.pipe(distinctUntilChanged());
    }

    private readonly _resetState: TFilter;

    private _state$: BehaviorSubject<TFilter>;
    public state$: Observable<TFilter>;
    get state() {return this._state$.value}
    set state(state: TFilter) {this._state$.next(state)}

    set delta(state: Partial<TFilter>) {this.state = {...this.state, state}};

    protected constructor(state: TFilter, private saveAdapter?: FilterAdapter) {
        this._resetState = deepCopy(state);
        this._state$ = new BehaviorSubject(state);
        this.state$ = this._state$.asObservable();
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
        this._filter$.complete();
        this._activeFilters$.complete();
        this._serializerSub?.unsubscribe();
    }

    private _serializerSub?: Subscription;

    public withSerializer(serialize: (filter: TFilter) => FilterSaveState, deserialize: (state: FilterSaveState) => Partial<TFilter>) {
        if (!this.saveAdapter) throw Error(`Can't use a filter serializer without an adapter`);
        this._serializerSub = new Subscription();

        this._serializerSub.add(this._state$.pipe(
          throttleTime(500, asyncScheduler, {leading: true, trailing: true}),
          map(serialize),
          distinctUntilChanged()
        ).subscribe(state => this.saveAdapter?.writeState(state)));

        this._serializerSub.add(this.saveAdapter.readState().pipe(
          map(deserialize)
        ).subscribe(state => this.delta = state));
    }
}

export class TreeFolderFilterService<TFilter, TFolder> extends FilterService<TFilter, BaseTreeFolder<TFolder>> {

}

export class TreeItemFilterService<TFilter, TItem> extends FilterService<TFilter, BaseTreeItem<TItem>> {

}
