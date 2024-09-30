import {TreeDataOptionConfig} from "./tree-source-config";
import {Selection, WithId} from "@juulsgaard/ts-tools";

function withParentId<TFolder extends WithId, TItem extends WithId>(itemParentId: Selection<TItem, string>) {
  return new TreeDataOptionConfig<TFolder, TItem>(itemParentId);
}

function withChildren<TFolder extends WithId, TItem extends WithId>(folderChildren: Selection<TFolder, TItem[]>) {
  return new TreeDataOptionConfig<TFolder, TItem>(undefined, folderChildren);
}

const compiled = withParentId as typeof withParentId & {withParentId: typeof withParentId, withChildren: typeof withChildren};
compiled.withParentId = withParentId;
compiled.withChildren = withChildren;

export const treeDataSource = compiled;
