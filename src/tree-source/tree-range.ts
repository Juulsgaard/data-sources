import {arrToLookup, isString, ReadonlyLookup, WithId} from "@juulsgaard/ts-tools";
import {TreeDataSource} from "./tree-data-source";
import {BaseTreeFolder, BaseTreeItem, TreeFolder, TreeItem} from "./tree-data";
import {
  assertInInjectionContext, computed, DestroyRef, effect, inject, Injector, isSignal, Signal, untracked
} from "@angular/core";
import {SignalSet} from "@juulsgaard/signal-tools";
import {ITreeState} from "./tree-state-common";
import {RangeSelectionState} from "../lib/types";
import {Subscribable} from "rxjs";

export class TreeItemRange<TFolder extends WithId, TItem extends WithId> implements ITreeState<TFolder, TItem> {

  readonly multiple: true = true;

  private readonly _itemIds = new SignalSet<string>();

  readonly itemIds = this._itemIds.value;
  readonly itemIdArray = this._itemIds.array;

  readonly items: Signal<TItem[]>;
  readonly baseItems: Signal<BaseTreeItem<TItem>[]>;
  readonly metaItems: Signal<TreeItem<TFolder, TItem>[]>;
  readonly size: Signal<number>;
  readonly empty: Signal<boolean>;

  constructor(private readonly dataSource: TreeDataSource<TFolder, TItem>) {

    this.baseItems = computed(() => this.getItemsFromLookup(dataSource.baseItemLookup));
    this.metaItems = computed(() => this.getItemsFromLookup(dataSource.metaItemLookup));
    this.items = computed(() => this.baseItems().map(x => x.model));

    this.size = computed(() => this.baseItems().length);
    this.empty = computed(() => this.size() <= 0);
  }

  private getItemsFromLookup<T>(lookupSignal: Signal<Map<string, T>>): T[] {
    const ids = this.itemIdArray();
    if (!ids.length) return [];
    const lookup = lookupSignal();
    return ids.map(id => lookup.get(id)).filter((x): x is T => !!x);
  }

  /**
   * Toggle the folder in the selection
   * @param folder - The folder to toggle
   * @param state - A forced state (`true` = always add, `false` = always delete)
   * @param shallow - Only add direct children
   * @returns The applied change (`true` = folder items added, `false` = folder items removed, `undefined` = nothing changed)
   */
  toggleFolder(
    folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>,
    state?: boolean,
    shallow = false
  ): boolean | undefined {

    const metaFolder = this.getMetaFolder(folder);
    if (!metaFolder) return undefined;
    if (metaFolder.itemCount <= 0) return undefined;

    const allItemIds = shallow
      ? metaFolder.items.map(x => x.model.id)
      : [...this.getFolderItems(metaFolder!)].map(x => x.model.id);

    if (state === false) return this._itemIds.deleteRange(allItemIds);
    if (state === true) return this._itemIds.addRange(allItemIds);

    const selectionState = this.getMetaFolderState(undefined, metaFolder, untracked(this.itemIds), shallow);

    if (selectionState === 'all') {
      return this._itemIds.deleteRange(allItemIds);
    }

    return this._itemIds.addRange(allItemIds);
  }

  private* getFolderItems(folder: TreeFolder<TFolder, TItem>): Generator<TreeItem<TFolder, TItem>, void, undefined> {
    yield* folder.items;
    for (let subFolder of folder.folders) {
      yield* this.getFolderItems(subFolder);
    }
  }

  /**
   * Toggle an item in the selection
   * @param item - The item to toggle
   * @param state - A forced state (`true` = always add, `false` = always delete)
   * @returns The applied change (`true` = item added, `false` = item removed, `undefined` = nothing changed)
   */
  toggleItem(
    item: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem>,
    state?: boolean
  ): boolean | undefined {
    const itemId = isString(item) ? item :
      'id' in item ? item.id :
        item.model.id;

    return this._itemIds.toggle(itemId, state);
  }

  setRange(list: string[] | WithId[]) {
    this._itemIds.set(list.map(x => isString(x) ? x : x.id));
  }

  clear() {
    this._itemIds.clear();
  }

  //<editor-fold desc="Folder Checkbox State">

  //<editor-fold desc="Bulk Folder State">
  private readonly shallowFolderStates = computed(() => {
    const selection = this.itemIds();
    if (selection.size <= 0) return new Map<string, RangeSelectionState>();

    const itemsPerFolder = arrToLookup(this.dataSource.baseItems(), x => x.folderId);

    const map = new Map<string, RangeSelectionState>();
    for (const [folderId, items] of itemsPerFolder) {
        map.set(folderId, this.getFolderItemState(items, selection));
    }

    return map;
  });

  private readonly folderStates = computed(() => {
    const itemStates = this.shallowFolderStates();
    if (itemStates.size <= 0) return new Map<string, RangeSelectionState>();

    const map = new Map<string, RangeSelectionState>();

    const folders = this.dataSource.baseFolders();
    const folderLookup = arrToLookup(this.dataSource.baseFolders(), x => x.parentId);

    for (let folder of folders) {
      this.storeLookupFolderState(folder, itemStates, folderLookup, map);
    }

    return map;
  });
  //</editor-fold>

  /**
   * Get a signal emitting the current selection state of a given folder
   * @param folder
   * @param shallow - Only look at direct descendants for selection state
   */
  getFolderState(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>, shallow = false): Signal<RangeSelectionState> {

    if (!isString(folder) && 'items' in folder) {

      return computed(() => {
        const selection = this.itemIds();
        if (!selection.size) return 'none';
        return this.getMetaFolderState(undefined, folder, selection, shallow) ?? 'none';
      });

    }

    const folderId = isString(folder) ? folder :
      'id' in folder ? folder.id :
        folder.model.id;

    if (shallow) return computed(() => this.shallowFolderStates().get(folderId) ?? 'none');
    else return computed(() => this.folderStates().get(folderId) ?? 'none');
  }

  private getMetaFolder(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>): TreeFolder<TFolder, TItem> | undefined {
    if (!isString(folder) && 'items' in folder) return folder;

    const folderId = isString(folder) ? folder :
      'id' in folder ? folder.id :
        folder.model.id;

    return untracked(this.dataSource.metaFolderLookup).get(folderId);
  }

  //<editor-fold desc="Build Folder States">
  private getMetaFolderState(
    parentState: RangeSelectionState | undefined,
    folder: TreeFolder<TFolder, TItem>,
    selection: ReadonlySet<string>,
    shallow = false
  ): RangeSelectionState | undefined {

    if (shallow) return this.getFolderItemState(folder.items, selection);

    let state = parentState;

    const itemState = this.getFolderItemState(folder.items, selection);

    if (itemState) {
      if (itemState === 'some') return 'some';
      state ??= itemState;
      if (itemState !== state) return 'some';
    }

    for (let subFolder of folder.folders) {
      const subState = this.getMetaFolderState(parentState, subFolder, selection);
      if (subState === 'some') return 'some';
      state ??= subState;
      if (subState !== state) return 'some';
    }

    return state;
  }

  private storeLookupFolderState(
    folder: BaseTreeFolder<TFolder>,
    itemStates: ReadonlyMap<string, RangeSelectionState>,
    folderLookup: ReadonlyLookup<string|undefined, BaseTreeFolder<TFolder>>,
    folderStates: Map<string, RangeSelectionState|undefined>
  ): RangeSelectionState|undefined {

    let state = folderStates.get(folder.model.id);
    if (state) return state;

    state = this.getLookupFolderState(folder, itemStates, folderLookup, folderStates);

    folderStates.set(folder.model.id, state);
    return state;
  }

  private getLookupFolderState(
    folder: BaseTreeFolder<TFolder>,
    itemStates: ReadonlyMap<string, RangeSelectionState>,
    folderLookup: ReadonlyLookup<string|undefined, BaseTreeFolder<TFolder>>,
    folderStates: Map<string, RangeSelectionState|undefined>
  ): RangeSelectionState|undefined {

    const itemState = itemStates.get(folder.model.id);
    if (itemState === 'some') return 'some';

    let state = itemState;

    const subFolders = folderLookup.get(folder.model.id) ?? [];
    for (let subFolder of subFolders) {
      const subState = this.storeLookupFolderState(subFolder, itemStates, folderLookup, folderStates);

      if (subState) {
        if (subState === 'some') return 'some';

        if (!state) state = subState;
        else if (subState !== state) return 'some';
      }
    }

    return state;
  }

  private getFolderItemState(
    items: BaseTreeItem<TItem>[],
    selection: ReadonlySet<string>
  ): RangeSelectionState {

    if (!items.length) return 'none';

    const state: RangeSelectionState = selection.has(items[0]!.model.id) ? 'all' : 'none';

    if (items.length === 1) return state;

    let first = true;
    for (let item of items) {

      if (first) {
        first = false;
        continue;
      }

      const selected = selection.has(item.model.id);
      if (selected && state === 'none') return 'some';
      if (!selected && state === 'all') return 'all';
    }

    return state;
  }
  //</editor-fold>

  //</editor-fold>

  /**
   * Create a signal emitting true when an item in the given folder is selected
   * @param folder
   */
  folderIsActive(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>): Signal<boolean> {
    const folderId = isString(folder) ? folder :
      'id' in folder ? folder.id :
        folder.model.id;

    return computed(() => this.metaItems().some(x => x.folderId == folderId));
  }

  /**
   * Create a signal emitting true when the given item is selected
   * @param item
   */
  itemIsActive(item: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem>): Signal<boolean> {
    const itemId = isString(item) ? item :
      'id' in item ? item.id :
        item.model.id;

    return this._itemIds.has(itemId);
  }
}

/**
 * Create a range for the Datasource
 * @param datasource - The datasource
 */
export function treeItemRange<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>
): TreeItemRange<TFolder, TItem>;
/**
 * Create a range for the Datasource with external ids
 * @param datasource - The datasource
 * @param ids - The id signal
 * @param options
 */
export function treeItemRange<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>,
  ids: Signal<string[]>,
  options?: { injector?: Injector }
): TreeItemRange<TFolder, TItem>;
/**
 * Create a range for the Datasource with external ids
 * @param datasource - The datasource
 * @param ids$ - The id observable
 * @param options
 */
export function treeItemRange<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>,
  ids$: Subscribable<string[]>,
  options?: { injector?: Injector }
): TreeItemRange<TFolder, TItem>;
export function treeItemRange<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>,
  ids?: Signal<string[]> | Subscribable<string[]>,
  options?: { injector?: Injector }
): TreeItemRange<TFolder, TItem> {
  if (ids && !options?.injector) assertInInjectionContext(treeItemRange);

  const state = new TreeItemRange(datasource);

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

export type AnyTreeRange<TFolder extends WithId, TItem extends WithId> =
  | TreeItemRange<TFolder, TItem>;
