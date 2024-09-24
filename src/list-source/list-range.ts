import {isString, WithId} from "@juulsgaard/ts-tools";
import {ListDataSource} from "./list-data-source";
import {SignalSet} from "@juulsgaard/signal-tools";
import {
  assertInInjectionContext, computed, DestroyRef, effect, inject, Injector, isSignal, Signal
} from "@angular/core";
import {Subscribable} from "rxjs";

export class ListRange<TModel extends WithId> {

  private readonly _itemIds = new SignalSet<string>();

  readonly itemIds = this._itemIds.value;
  readonly itemIdArray = this._itemIds.array;

  readonly items: Signal<TModel[]>;
  readonly size: Signal<number>;
  readonly empty: Signal<boolean>;

  readonly selectionState: Signal<ActiveState>;
  readonly someSelected: Signal<boolean>;
  readonly allSelected: Signal<boolean>;

  constructor(dataSource: ListDataSource<TModel>) {

    this.items = computed(() => {
      const ids = this.itemIdArray();
      if (!ids.length) return [];
      const lookup = dataSource.itemLookup();
      return ids.map(id => lookup.get(id)).filter(x => !!x);
    });

    this.size = computed(() => this.items().length);
    this.empty = computed(() => this.size() <= 0);

    this.selectionState = computed(() => {
      const size = this.size();
      if (size <= 0) return 'none';
      const collectionSize = dataSource.length();
      if (size < collectionSize) return 'some';
      return 'all';
    });

    this.someSelected = computed(() => this.selectionState() === 'some');
    this.allSelected = computed(() => this.selectionState() === 'all');
  }

  setRange(list: string[] | WithId[]) {
    this._itemIds.set(list.map(x => isString(x) ? x : x.id));
  }

  clear() {
    this._itemIds.clear();
  }

  /**
   * Toggle an item in the selection
   * @param item - The item to toggle
   * @param state - A forced state (`true` = always add, `false` = always delete)
   * @returns The applied change (`true` = item added, `false` = item removed, `undefined` = nothing changed)
   */
  toggleItem(item: string | WithId, state?: boolean): boolean|undefined {
    const id = isString(item) ? item : item.id;
    return this._itemIds.toggle(id, state);
  }

  /**
   * Create a signal emitting true when the given item is selected
   * @param item
   */
  isActive(item: WithId | string): Signal<boolean> {
    const id = isString(item) ? item : item.id;
    return this._itemIds.has(id);
  }
}

type ActiveState = 'none' | 'some' | 'all';

/**
 * Create a range for the Datasource
 * @param datasource - The datasource
 */
export function listRange<T extends WithId>(
  datasource: ListDataSource<T>
): ListRange<T>;
/**
 * Create a range for the Datasource with external ids
 * @param datasource - The datasource
 * @param ids - The id signal
 * @param options
 */
export function listRange<T extends WithId>(
  datasource: ListDataSource<T>,
  ids: Signal<string[]>,
  options?: { injector?: Injector }
): ListRange<T>;
/**
 * Create a range for the Datasource with external ids
 * @param datasource - The datasource
 * @param ids$ - The id observable
 * @param options
 */
export function listRange<T extends WithId>(
  datasource: ListDataSource<T>,
  ids$: Subscribable<string[]>,
  options?: { injector?: Injector }
): ListRange<T>;
export function listRange<T extends WithId>(
  datasource: ListDataSource<T>,
  ids?: Signal<string[]> | Subscribable<string[]>,
  options?: { injector?: Injector }
): ListRange<T> {
  if (ids && !options?.injector) assertInInjectionContext(listRange);

  const state = new ListRange(datasource);

  if (!ids) return state;

  if (isSignal(ids)) {
    effect(() => state.setRange(ids()), {injector: options?.injector});
  } else {
    const onDestroy = options?.injector?.get(DestroyRef) ?? inject(DestroyRef);
    const sub = ids.subscribe({next: x => state.setRange(x)});
    onDestroy.onDestroy(() => sub.unsubscribe());
  }

  return state;
}
