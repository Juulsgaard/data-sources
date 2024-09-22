import {BaseTreeFolder, BaseTreeItem} from "../tree-source/tree-data";
import {deepCopy} from "@juulsgaard/ts-tools";
import {FilterAdapter, FilterReadState, FilterSaveState, MappedReadState} from "./filter-adapter";
import {DataFilter, IndividualDataFilter} from "./data-filter";
import {
  assertInInjectionContext, computed, DestroyRef, effect, inject, Injector, signal, Signal, untracked, WritableSignal
} from "@angular/core";
import {debouncedSignal} from "../lib/signals";

export interface IFilterServiceState<TModel> {
  filter<T extends TModel>(list: T[]): T[];
}

export class FilterServiceState<TFilter, TModel> implements IFilterServiceState<TModel> {

  private readonly filterState: TFilter;

  constructor(filterState: TFilter, private readonly filters: DataFilter<TFilter, TModel>[]) {
    this.filterState = deepCopy(filterState);
  }

  filter<T extends TModel>(list: T[]): T[] {
    for (let f of this.filters) {
      list = f.filter(this.filterState, list);
    }
    return list;
  }
}

export type ITreeFolderFilterState<TFolder> = IFilterServiceState<BaseTreeFolder<TFolder>>;
export type TreeFolderFilterState<TFilter, TFolder> = FilterServiceState<TFilter, BaseTreeFolder<TFolder>>;
export type ITreeItemFilterState<TItem> = IFilterServiceState<BaseTreeItem<TItem>>;
export type TreeItemFilterState<TFilter, TItem> = FilterServiceState<TFilter, BaseTreeItem<TItem>>;

export interface IFilterService<TModel> {
  activeFilters: Signal<number>;
  filter: Signal<IFilterServiceState<TModel>>;
}

export abstract class FilterService<TFilter extends Record<string, unknown>, TModel> implements IFilterService<TModel> {

  private readonly onDestroy = inject(DestroyRef);

  private _filters: DataFilter<TFilter, TModel>[] = [];

  filter: Signal<FilterServiceState<TFilter, TModel>>;
  activeFilters: Signal<number>;

  private readonly _resetState: TFilter;

  private readonly _state: WritableSignal<TFilter>;
  public readonly state: Signal<TFilter>;
  public readonly debouncedState: Signal<TFilter>;

  setState(state: TFilter) {
    this._state.set(state)
  }

  updateState(state: Partial<TFilter>) {
    this.setState({...this.state(), ...state})
  };

  protected modifyState(change: (state: TFilter) => Partial<TFilter>) {
    const state = untracked(this.state);
    const result = change(state);
    if (state === result) return;
    this.updateState(result);
  }

  protected constructor(state: TFilter, private saveAdapter?: FilterAdapter) {
    this._resetState = deepCopy(state);

    this._state = signal(state);
    this.state = this._state.asReadonly();

    this.debouncedState = debouncedSignal(this.state, 500);

    this.activeFilters = computed(() => {
      const state = this.debouncedState();
      return this._filters.reduce((acc, x) => x.isActive(state) ? acc + 1 : acc, 0)
    });

    this.filter = computed(() => {
      const state = this.debouncedState();
      return new FilterServiceState<TFilter, TModel>(state, this._filters);
    });
  }

  protected addFullFilter(isActive: (filter: TFilter) => boolean, filter: <T extends TModel>(list: T[], filter: TFilter) => T[]) {
    this._filters.push(new DataFilter<TFilter, TModel>(filter, isActive));
  }

  protected addFilter(isActive: (filter: TFilter) => boolean, filter: (item: TModel, filter: TFilter) => boolean) {
    this._filters.push(new IndividualDataFilter<TFilter, TModel>(filter, isActive));
  }

  public clearFilter() {
    this.setState(deepCopy(this._resetState));
  }

  public async withSerializer<TState extends FilterSaveState>(
    serialize: (filter: TFilter) => TState,
    deserialize: (state: MappedReadState<TState>) => Partial<TFilter>,
    injector?: Injector
  ) {
    if (!this.saveAdapter) throw Error(`Can't use a filter serializer without an adapter`);

    if (!injector) assertInInjectionContext(this.withSerializer);
    injector ??= inject(Injector);

    await this.deserialize(deserialize as (state: FilterReadState) => Partial<TFilter>);

    effect(() => {
      try {
        const state = this.debouncedState();
        const data = serialize(state);
        this.saveAdapter?.writeState(data);
      } catch (err) {
        console.log('Failed to serialize filter', this.constructor.name, err);
      }
    }, {injector});
  }

  private async deserialize(deserialize: (state: FilterReadState) => Partial<TFilter>) {
    if (!this.saveAdapter) throw Error(`Can't use a filter serializer without an adapter`);

    await this.saveAdapter.readState().then(deserialize).then(
      state => this.updateState(state),
      err => console.log('Failed to deserialize filter', this.constructor.name, err)
    );
  }
}

export type ITreeFolderFilterService<TFolder> = IFilterService<BaseTreeFolder<TFolder>>;

export class TreeFolderFilterService<TFilter extends Record<string, unknown>, TFolder> extends FilterService<TFilter, BaseTreeFolder<TFolder>> {

}

export type ITreeItemFilterService<TItem> = IFilterService<BaseTreeItem<TItem>>;

export class TreeItemFilterService<TFilter extends Record<string, unknown>, TItem> extends FilterService<TFilter, BaseTreeItem<TItem>> {

}
