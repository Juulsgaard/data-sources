import {BaseTreeFolder, BaseTreeItem, TreeFolder, TreeItem} from "./tree-data";
import {TreeDataSource} from "./tree-data-source";
import {isString, WithId} from "@juulsgaard/ts-tools";
import {computed, signal, Signal} from "@angular/core";

interface ITreeSelection<TFolder extends WithId, TItem extends WithId> {
  readonly multiple: false;

  readonly folderId: Signal<string | undefined>;
  readonly folder: Signal<TFolder | undefined>;
  readonly baseFolder: Signal<BaseTreeFolder<TFolder> | undefined>;
  readonly metaFolder: Signal<TreeFolder<TFolder, TItem> | undefined>;

  readonly itemId: Signal<string | undefined>;
  readonly item: Signal<TItem | undefined>;
  readonly baseItem: Signal<BaseTreeItem<TItem> | undefined>;
  readonly metaItem: Signal<TreeItem<TFolder, TItem> | undefined>;

  readonly empty: Signal<boolean>;
}

export class TreeSelection<TFolder extends WithId, TItem extends WithId> implements ITreeSelection<TFolder, TItem> {

  readonly multiple: false = false;

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

export class TreeItemSelection<TFolder extends WithId, TItem extends WithId> implements ITreeSelection<TFolder, TItem>{

  readonly multiple: false = false;

  private readonly _itemId = signal<string | undefined>(undefined);
  readonly itemId = this._itemId.asReadonly();
  readonly item: Signal<TItem | undefined>;
  readonly baseItem: Signal<BaseTreeItem<TItem> | undefined>;
  readonly metaItem: Signal<TreeItem<TFolder, TItem> | undefined>;

  readonly folderId = computed(() => this.baseItem()?.folderId);
  readonly folder: Signal<TFolder | undefined>;
  readonly baseFolder: Signal<BaseTreeFolder<TFolder> | undefined>;
  readonly metaFolder: Signal<TreeFolder<TFolder, TItem> | undefined>;

  readonly empty = computed(() => !this.item());

  constructor(datasource: TreeDataSource<TFolder, TItem>) {

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

  setItem(value: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem> | undefined) {
    const itemId = value == undefined ? undefined :
      isString(value) ? value :
        'id' in value ? value.id :
          value.model.id;

    this._itemId.set(itemId);
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

    return computed(() => this.itemId() === itemId);
  }
}

// export class TreeFolderSelection<TFolder extends WithId, TItem extends WithId> {
//
// }

export type AnyTreeSelection<TFolder extends WithId, TItem extends WithId> =
  | TreeSelection<TFolder, TItem>
  | TreeItemSelection<TFolder, TItem>;

