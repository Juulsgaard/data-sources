import {isString, WithId} from "@juulsgaard/ts-tools";
import {TreeDataSource} from "./tree-data-source";
import {BaseTreeFolder, BaseTreeItem, TreeFolder, TreeItem} from "./tree-data";
import {
  assertInInjectionContext, computed, DestroyRef, effect, inject, Injector, isSignal, signal, Signal, untracked
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
  toggleFolder(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>, state?: boolean, shallow = false): boolean|undefined {

    const metaFolder = this.getMetaFolder(folder);
    if (!metaFolder) return undefined;
    if (metaFolder.itemCount <= 0) return undefined;

    const allItemIds = shallow
      ? metaFolder.items.map(x => x.model.id)
      : [...this.getFolderItems(metaFolder!)].map(x => x.model.id);

    if (state === false) return this._itemIds.deleteRange(allItemIds);
    if (state === true) return this._itemIds.addRange(allItemIds);

    const selectionState = this._getFolderState(undefined, metaFolder, untracked(this.itemIds), shallow);

    if (selectionState === 'all') {
      return this._itemIds.deleteRange(allItemIds);
    }

    return this._itemIds.addRange(allItemIds);
  }

  private *getFolderItems(folder: TreeFolder<TFolder, TItem>): Generator<TreeItem<TFolder, TItem>, void, undefined> {
    yield *folder.items;
    for (let subFolder of folder.folders) {
      yield *this.getFolderItems(subFolder);
    }
  }

  /**
   * Toggle an item in the selection
   * @param item - The item to toggle
   * @param state - A forced state (`true` = always add, `false` = always delete)
   * @returns The applied change (`true` = item added, `false` = item removed, `undefined` = nothing changed)
   */
  toggleItem(item: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem>, state?: boolean): boolean|undefined {
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
  private folderStates = new Map<string, Signal<RangeSelectionState>>;
  getFolderState(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>): Signal<RangeSelectionState> {

    const folderId = isString(folder) ? folder :
      'id' in folder ? folder.id :
        folder.model.id;

    const existingState = this.folderStates.get(folderId);
    if (existingState) return existingState;

    let folderSignal: Signal<TreeFolder<TFolder, TItem>|undefined>;
    let saveSignal: boolean;

    if (!isString(folder) && 'items' in folder) {
      folderSignal = signal(folder);
      saveSignal = false;
    } else {
      folderSignal = computed(() => this.dataSource.metaFolderLookup().get(folderId));
      saveSignal = true;
    }

    const output = computed(() => {
      const selection = this.itemIds();
      if (!selection.size) return 'none';
      const folder = folderSignal();
      if (!folder) return 'none';
      return this._getFolderState(undefined, folder, selection) ?? 'none';
    });

    if (saveSignal) this.folderStates.set(folderId, output);

    return output;
  }

  private getMetaFolder(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>): TreeFolder<TFolder, TItem>|undefined {
    if (!isString(folder) && 'items' in folder) return folder;

    const folderId = isString(folder) ? folder :
      'id' in folder ? folder.id :
        folder.model.id;

    return untracked(this.dataSource.metaFolderLookup).get(folderId);
  }

  private getCurrentFolderState(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>) {

    const selection = untracked(this.itemIds);
    if (!selection.size) return 'none';

    const folderId = isString(folder) ? folder :
      'id' in folder ? folder.id :
        folder.model.id;

    const existingState = this.folderStates.get(folderId);
    if (existingState) return untracked(existingState);

    const metaFolder = this.getMetaFolder(folder);
    if (!metaFolder) return 'none';

    return this._getFolderState(undefined, metaFolder, selection) ?? 'none';
  }

  private _getFolderState(
    parentState: RangeSelectionState | undefined,
    folder: TreeFolder<TFolder, TItem>,
    selection: ReadonlySet<string>,
    shallow = false
  ): RangeSelectionState | undefined {

    if (shallow) return this.getFolderItemState(folder, selection);

    let state = parentState;

    const itemState = this.getFolderItemState(folder, selection);

    if (itemState) {
      if (itemState === 'some') return 'some';
      state ??= itemState;
      if (itemState !== state) return 'some';
    }

    for (let subFolder of folder.folders) {
      const subState = this._getFolderState(parentState, subFolder, selection);
      if (subState === 'some') return 'some';
      state ??= subState;
      if (subState !== state) return 'some';
    }

    return state;
  }

  private getFolderItemState(
    folder: TreeFolder<TFolder, TItem>,
    selection: ReadonlySet<string>
  ): RangeSelectionState | undefined {

    if (!folder.items.length) return undefined;

    const state: RangeSelectionState = selection.has(folder.items[0]!.model.id) ? 'all' : 'none';

    if (folder.items.length === 1) return state;

    let first = true;
    for (let item of folder.items) {

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
