import {asyncScheduler, BehaviorSubject} from "rxjs";
import {distinctUntilChanged, throttleTime} from "rxjs/operators";
import {BaseTreeFolder, BaseTreeItem} from "./tree-source/tree-data";
import {deepCopy} from "./lib/objects";

class DataFilter<TFilter, TModel> {
    constructor(
        private readonly _filter: (list: TModel[], filter: TFilter) => TModel[],
        private readonly _isActive: (filter: TFilter) => boolean
    ) {

    }

    isActive(filter: TFilter) {
        return this._isActive(filter)
    }

    filter(filter: TFilter, list: TModel[]) {
        if (!this.isActive(filter)) return list;
        return this._filter(list, filter);
    }
}

class IndividualDataFilter<TFilter, TModel> extends DataFilter<TFilter, TModel> {
    constructor(
        filter: (data: TModel, filter: TFilter) => boolean,
        isActive: (filter: TFilter) => boolean
    ) {
        super((list, f) => list.filter(x => filter(x, f)), isActive);
    }
}

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

    protected constructor(public state: TFilter) {
        this._resetState = deepCopy(state);
    }

    protected addFullFilter(isActive: (filter: TFilter) => boolean, filter: (list: TModel[], filter: TFilter) => TModel[]) {
        this._filters.push(new DataFilter<TFilter, TModel>(filter, isActive));
    }

    protected addFilter(isActive: (filter: TFilter) => boolean, filter: (item: TModel, filter: TFilter) => boolean) {
        this._filters.push(new IndividualDataFilter<TFilter, TModel>(filter, isActive));
    }

    protected commit() {
        this._filter$.next(new FilterServiceState<TFilter, TModel>(this.state, this._filters));
        this._activeFilters$.next(this.activeFilters);
    }

    public clearFilter() {
        this.state = deepCopy(this._resetState);
        this.commit();
    }
}

export class TreeFolderFilterService<TFilter, TFolder> extends FilterService<TFilter, BaseTreeFolder<TFolder>> {

}

export class TreeItemFilterService<TFilter, TItem> extends FilterService<TFilter, BaseTreeItem<TItem>> {

}
