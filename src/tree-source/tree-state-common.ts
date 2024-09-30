import {Signal} from "@angular/core";
import {WithId} from "@juulsgaard/ts-tools";
import {BaseTreeFolder, BaseTreeItem, TreeFolder, TreeItem} from "./tree-data";

export interface ITreeState<TFolder extends WithId, TItem extends WithId> {
  readonly multiple: boolean;
  readonly empty: Signal<boolean>;

  clear(): void;

  folderIsActive(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>): Signal<boolean>;
  itemIsActive(item: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem>): Signal<boolean>;

  toggleFolder(folder: string | WithId | BaseTreeFolder<TFolder> | TreeFolder<TFolder, TItem>, state?: boolean): boolean|undefined;
  toggleItem(item: string | WithId | BaseTreeItem<TItem> | TreeItem<TFolder, TItem>, state?: boolean): boolean|undefined;
}
