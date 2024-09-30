import {BaseTreeFolder, BaseTreeItem, TreeFolder, TreeItem} from "./tree-data";
import {TreeDataSource} from "./tree-data-source";
import {isString, WithId} from "@juulsgaard/ts-tools";
import {
  assertInInjectionContext, computed, DestroyRef, effect, inject, Injector, isSignal, signal, Signal, untracked
} from "@angular/core";
import {ITreeState} from "./tree-state-common";
import {Subscribable} from "rxjs";

abstract class ITreeSelection<TFolder extends WithId, TItem extends WithId> implements ITreeState<TFolder, TItem> {
  readonly multiple = false;

  abstract readonly folderId: Signal<string | undefined>;
  abstract readonly folder: Signal<TFolder | undefined>;
  abstract readonly baseFolder: Signal<BaseTreeFolder<TFolder> | undefined>;
  abstract readonly metaFolder: Signal<TreeFolder<TFolder, TItem> | undefined>;

  abstract readonly itemId: Signal<string | undefined>;
  abstract readonly item: Signal<TItem | undefined>;
  abstract readonly baseItem: Signal<BaseTreeItem<TItem> | undefined>;
  abstract readonly metaItem: Signal<TreeItem<TFolder, TItem> | undefined>;

  abstract setFolder(value: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem> | undefined): void;
  abstract setItem(value: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem> | undefined): void;

  /**
   * Toggle the folder in the selection
   * @param folder - The folder to toggle
   * @param state - A forced state (`true` = always add, `false` = always delete)
   * @returns The applied change (`true` = folder added, `false` = folder removed, `undefined` = nothing changed)
   */
  toggleFolder(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>, state?: boolean): boolean|undefined {
    const folderId = isString(folder) ? folder :
        'id' in folder ? folder.id :
          folder.model.id;

    if (untracked(this.folderId) === folderId) {
      if (state === true) return undefined;
      this.setFolder(folder);
      return false;
    }

    if (state === false) return undefined;
    this.setFolder(folder);
    return true;
  }

  /**
   * Toggle the item in the selection
   * @param item - The item to toggle
   * @param state - A forced state (`true` = always add, `false` = always delete)
   * @returns The applied change (`true` = item added, `false` = item removed, `undefined` = nothing changed)
   */
  toggleItem(item: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem>, state?: boolean): boolean|undefined {
    const itemId = isString(item) ? item :
        'id' in item ? item.id :
          item.model.id;

    if (untracked(this.itemId) === itemId) {
      if (state === true) return undefined;
      this.setItem(item);
      return false;
    }

    if (state === false) return undefined;
    this.setItem(item);
    return true;
  }

  readonly abstract empty: Signal<boolean>;
  abstract clear(): void;
  abstract folderIsActive(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>): Signal<boolean>;
  abstract itemIsActive(item: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem>): Signal<boolean>;
}

//<editor-fold desc="Full Selection">
export class TreeSelection<TFolder extends WithId, TItem extends WithId> extends ITreeSelection<TFolder, TItem> {

  private readonly _folderId = signal<string | undefined>(undefined);
  readonly folderId = this._folderId.asReadonly();
  readonly folder: Signal<TFolder | undefined>;
  readonly baseFolder: Signal<BaseTreeFolder<TFolder> | undefined>;
  readonly metaFolder: Signal<TreeFolder<TFolder, TItem> | undefined>;

  private readonly _itemId = signal<string | undefined>(undefined);
  readonly itemId = this._itemId.asReadonly();
  readonly item: Signal<TItem | undefined>;
  readonly baseItem: Signal<BaseTreeItem<TItem> | undefined>;
  readonly metaItem: Signal<TreeItem<TFolder, TItem> | undefined>;

  readonly empty = computed(() => !this.item());

  constructor(private readonly datasource: TreeDataSource<TFolder, TItem>) {
    super();

    this.baseFolder = computed(() => {
      const id = this.folderId();
      if (!id) return undefined;
      return datasource.baseFolderLookup().get(id);
    });

    this.folder = computed(() => this.baseFolder()?.model);

    this.metaFolder = computed(() => {
      const id = this.folderId();
      if (!id) return undefined;
      return datasource.metaFolderLookup().get(id);
    });

    this.baseItem = computed(() => {
      const id = this.itemId();
      if (!id) return undefined;

      const item = datasource.baseItemLookup().get(id);
      if (!item) return undefined;

      const folder = this.baseFolder();
      if (!folder) return undefined;

      if (item.folderId !== folder.model.id) return undefined;
      return item;
    });

    this.item = computed(() => this.baseItem()?.model);

    this.metaItem = computed(() => {
      const id = this.itemId();
      if (!id) return undefined;

      const folder = this.baseFolder();
      if (!folder) return undefined;

      const item = datasource.metaItemLookup().get(id);
      if (!item) return undefined;

      if (item.folderId !== folder.model.id) return undefined;
      return item;
    });
  }

  setFolder(value: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem> | undefined) {
    const folderId = value == undefined ? undefined :
      isString(value) ? value :
        'id' in value ? value.id :
          value.model.id;

    this._folderId.set(folderId);
    this._itemId.set(undefined);
  }

  setItem(value: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem> | undefined) {
    const itemId = value == undefined ? undefined :
      isString(value) ? value :
        'id' in value ? value.id :
          value.model.id;

    let folderId = value == undefined ? undefined :
      isString(value) ? undefined :
        'id' in value ? undefined :
          value.folderId;

    if (!folderId && itemId) {
      folderId = this.datasource.baseItemLookup().get(itemId)?.folderId;
    }

    this._folderId.set(folderId);
    this._itemId.set(itemId);
  }

  clear() {
    this._folderId.set(undefined);
    this._itemId.set(undefined);
  }

  clearFolder() {
    this._folderId.set(undefined);
    this._itemId.set(undefined);
  }

  clearItem() {
    this._itemId.set(undefined);
  }

  /**
   * Create a signal emitting true when the given folder is selected
   * @param folder
   */
  folderIsActive(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>): Signal<boolean> {
    const folderId = folder == undefined ? undefined :
      isString(folder) ? folder :
        'id' in folder ? folder.id :
          folder.model.id;

    return computed(() => this.folderId() === folderId);
  }

  /**
   * Create a signal emitting true when the given item is selected
   * @param item
   */
  itemIsActive(item: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem>): Signal<boolean> {
    const itemId = item == undefined ? undefined :
      isString(item) ? item :
        'id' in item ? item.id :
          item.model.id;

    return computed(() => this.item()?.id === itemId);
  }

}

//<editor-fold desc="Constructor">
/**
 * Create a selection for the Datasource
 * @param datasource - The datasource
 */
export function treeSelection<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>
): TreeSelection<TFolder, TItem>;
/**
 * Create a selection for the Datasource with an external Id
 * @param datasource - The datasource
 * @param folderId - The folder id signal
 * @param id - The id signal
 * @param options
 */
export function treeSelection<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>,
  folderId: Signal<string | undefined>,
  id?: Signal<string | undefined>,
  options?: { injector?: Injector }
): TreeSelection<TFolder, TItem>;
/**
 * Create a selection for the Datasource with an external Id
 * @param datasource - The datasource
 * @param folderId$ - The folder id observable
 * @param id$ - The id observable
 * @param options
 */
export function treeSelection<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>,
  folderId$: Subscribable<string | undefined>,
  id$?: Subscribable<string | undefined>,
  options?: { injector?: Injector }
): TreeSelection<TFolder, TItem>;

export function treeSelection<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>,
  folderId?: Signal<string | undefined> | Subscribable<string | undefined>,
  id?: Signal<string | undefined> | Subscribable<string | undefined>,
  options?: { injector?: Injector }
): TreeSelection<TFolder, TItem> {
  if (folderId && !options?.injector) assertInInjectionContext(treeSelection);

  const state = new TreeSelection(datasource);

  if (folderId) {
    if (isSignal(folderId)) {
      effect(() => state.setFolder(folderId()), {injector: options?.injector});
    } else {
      const onDestroy = options?.injector?.get(DestroyRef) ?? inject(DestroyRef);
      const sub = folderId.subscribe({next: x => state.setFolder(x)});
      onDestroy.onDestroy(() => sub.unsubscribe());
    }
  }

  if (id) {
    if (isSignal(id)) {
      effect(() => state.setItem(id()), {injector: options?.injector});
    } else {
      const onDestroy = options?.injector?.get(DestroyRef) ?? inject(DestroyRef);
      const sub = id.subscribe({next: x => state.setItem(x)});
      onDestroy.onDestroy(() => sub.unsubscribe());
    }
  }

  return state;
}
//</editor-fold>
//</editor-fold>

//<editor-fold desc="Item Selection">
export class TreeItemSelection<TFolder extends WithId, TItem extends WithId> extends ITreeSelection<TFolder, TItem>{

  private readonly _itemId = signal<string | undefined>(undefined);
  readonly itemId = computed(() => this._folderId() ? undefined : this._itemId());
  readonly item: Signal<TItem | undefined>;
  readonly baseItem: Signal<BaseTreeItem<TItem> | undefined>;
  readonly metaItem: Signal<TreeItem<TFolder, TItem> | undefined>;

  private readonly _folderId = signal<string | undefined>(undefined);
  readonly folderId = computed(() => this._folderId() ?? this.baseItem()?.folderId);
  readonly folder: Signal<TFolder | undefined>;
  readonly baseFolder: Signal<BaseTreeFolder<TFolder> | undefined>;
  readonly metaFolder: Signal<TreeFolder<TFolder, TItem> | undefined>;

  readonly empty = computed(() => !this.item());

  constructor(datasource: TreeDataSource<TFolder, TItem>) {
    super();

    this.baseItem = computed(() => {
      const id = this.itemId();
      if (!id) return undefined;
      return datasource.baseItemLookup().get(id);
    });

    this.item = computed(() => this.baseItem()?.model);

    this.metaItem = computed(() => {
      const id = this.itemId();
      if (!id) return undefined;
      return datasource.metaItemLookup().get(id);
    });

    this.baseFolder = computed(() => {
      const id = this.folderId();
      if (!id) return undefined;
      return datasource.baseFolderLookup().get(id);
    });

    this.folder = computed(() => this.baseFolder()?.model);

    this.metaFolder = computed(() => {
      const id = this.folderId();
      if (!id) return undefined;
      return datasource.metaFolderLookup().get(id);
    });
  }

  setFolder(value: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem> | undefined): void {
    const folderId = value == undefined ? undefined :
      isString(value) ? value :
        'id' in value ? value.id :
          value.model.id;

    this._folderId.set(folderId);
    this._itemId.set(undefined);
  }

  setItem(value: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem> | undefined) {
    const itemId = value == undefined ? undefined :
      isString(value) ? value :
        'id' in value ? value.id :
          value.model.id;

    this._folderId.set(undefined);
    this._itemId.set(itemId);
  }

  clear() {
    this._folderId.set(undefined);
    this._itemId.set(undefined);
  }

  /**
   * Create a signal emitting true when the given folder is selected
   * @param folder
   */
  folderIsActive(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>): Signal<boolean> {
    const folderId = folder == undefined ? undefined :
      isString(folder) ? folder :
        'id' in folder ? folder.id :
          folder.model.id;

    return computed(() => this.folderId() === folderId);
  }

  /**
   * Create a signal emitting true when the given item is selected
   * @param item
   */
  itemIsActive(item: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem>): Signal<boolean> {
    const itemId = item == undefined ? undefined :
      isString(item) ? item :
        'id' in item ? item.id :
          item.model.id;

    return computed(() => this.itemId() === itemId);
  }
}

//<editor-fold desc="Constructor">
/**
 * Create a selection for the Datasource
 * @param datasource - The datasource
 */
export function treeItemSelection<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>
): TreeItemSelection<TFolder, TItem>;
/**
 * Create a selection for the Datasource with an external Id
 * @param datasource - The datasource
 * @param id - The id signal
 * @param options
 */
export function treeItemSelection<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>,
  id: Signal<string | undefined>,
  options?: { injector?: Injector }
): TreeItemSelection<TFolder, TItem>;
/**
 * Create a selection for the Datasource with an external Id
 * @param datasource - The datasource
 * @param id$ - The id observable
 * @param options
 */
export function treeItemSelection<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>,
  id$: Subscribable<string | undefined>,
  options?: { injector?: Injector }
): TreeItemSelection<TFolder, TItem>;

export function treeItemSelection<TFolder extends WithId, TItem extends WithId>(
  datasource: TreeDataSource<TFolder, TItem>,
  id?: Signal<string | undefined> | Subscribable<string | undefined>,
  options?: { injector?: Injector }
): TreeItemSelection<TFolder, TItem> {
  if (id && !options?.injector) assertInInjectionContext(treeItemSelection);

  const state = new TreeItemSelection(datasource);

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
//</editor-fold>
//</editor-fold>

// export class TreeFolderSelection<TFolder extends WithId, TItem extends WithId> {
//
// }

export type AnyTreeSelection<TFolder extends WithId, TItem extends WithId> =
  | TreeSelection<TFolder, TItem>
  | TreeItemSelection<TFolder, TItem>;

