import {TreeDataOptionConfig} from "./tree-source-config";
import {Selection, WithId} from "@juulsgaard/ts-tools";
import {Injector} from "@angular/core";

function withParentId<TFolder extends WithId, TItem extends WithId>(itemParentId: Selection<TItem, string>, options?: {injector?: Injector}) {
  return new TreeDataOptionConfig<TFolder, TItem>(itemParentId, undefined, options);
}

function withChildren<TFolder extends WithId, TItem extends WithId>(folderChildren: Selection<TFolder, TItem[]>, options?: {injector?: Injector}) {
  return new TreeDataOptionConfig<TFolder, TItem>(undefined, folderChildren, options);
}

const compiled = withParentId as typeof withParentId & {withParentId: typeof withParentId, withChildren: typeof withChildren};
compiled.withParentId = withParentId;
compiled.withChildren = withChildren;

export const treeDataSource = compiled;
