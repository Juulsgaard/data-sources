import {Subscribable} from "rxjs";
import {isString, WithId} from "@juulsgaard/ts-tools";
import {ListDataSource} from "./list-data-source";
import {
  assertInInjectionContext, computed, DestroyRef, effect, inject, Injector, isSignal, Signal, signal, untracked
} from "@angular/core";
import {IListState} from "./list-state-common";

export class ListSelection<TModel extends WithId> implements IListState {

  readonly multiple: false = false;

  private readonly _itemId = signal<string | undefined>(undefined);
  readonly itemId = this._itemId.asReadonly();

  readonly item: Signal<TModel | undefined>;
  readonly empty: Signal<boolean>;

  constructor(dataSource: ListDataSource<TModel>) {
    this.item = computed(() => {
      const id = this.itemId();
      if (!id) return undefined;
      return dataSource.itemLookup().get(id);
    });

    this.empty = computed(() => !this.item());
  }

  setItem(value: string | WithId | undefined) {
    const id = isString(value) ? value : value?.id;
    this._itemId.set(id);
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

    if (untracked(this.itemId) === id) {
      if (state === true) return undefined;
      this.setItem(undefined);
      return false;
    }

    if (state === false) return undefined;
    this.setItem(id);
    return true;
  }

  /**
   * Create a signal emitting true when the given item is selected
   * @param item
   */
  isActive(item: WithId | string): Signal<boolean> {
    const id = isString(item) ? item : item.id;
    return computed(() => this.itemId() === id);
  }
}

/**
 * Create a selection for the Datasource
 * @param datasource - The datasource
 */
export function listSelection<T extends WithId>(
  datasource: ListDataSource<T>
): ListSelection<T>;
/**
 * Create a selection for the Datasource with an external Id
 * @param datasource - The datasource
 * @param id - The id signal
 * @param options
 */
export function listSelection<T extends WithId>(
  datasource: ListDataSource<T>,
  id: Signal<string | undefined>,
  options?: { injector?: Injector }
): ListSelection<T>;
/**
 * Create a selection for the Datasource with an external Id
 * @param datasource - The datasource
 * @param id$ - The id observable
 * @param options
 */
export function listSelection<T extends WithId>(
  datasource: ListDataSource<T>,
  id$: Subscribable<string | undefined>,
  options?: { injector?: Injector }
): ListSelection<T>;
export function listSelection<T extends WithId>(
  datasource: ListDataSource<T>,
  id?: Signal<string | undefined> | Subscribable<string | undefined>,
  options?: { injector?: Injector }
): ListSelection<T> {
  if (id && !options?.injector) assertInInjectionContext(listSelection);

  const state = new ListSelection(datasource);

  if (!id) return state;

  if (isSignal(id)) {
    effect(() => state.setItem(id()), {injector: options?.injector});
  } else {
    const onDestroy = options?.injector?.get(DestroyRef) ?? inject(DestroyRef);
    const sub = id.subscribe({next: x => state.setItem(x)});
    onDestroy.onDestroy(() => sub.unsubscribe());
  }

  return state;
}
