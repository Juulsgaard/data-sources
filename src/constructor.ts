import {Selection, WithId} from "@consensus-labs/ts-tools";
import {IListDataSourceConfig, ListDataSourceConfig} from "./list-source/list-source-config";
import {TreeDataOptionConfig} from "./tree-source/tree-source-config";

export module DataSource {

  export function List<TModel extends WithId>(): IListDataSourceConfig<TModel> {
    return new ListDataSourceConfig<TModel>();
  }

  export module Tree {

    export function WithItemParent<TFolder extends WithId, TItem extends WithId>(parentId: Selection<TItem, string>) {
      return new TreeDataOptionConfig<TFolder, TItem>(parentId, undefined);
    }

    export function WithFolderChildren<TFolder extends WithId, TItem extends WithId>(folderChildren: Selection<TFolder, TItem[]>) {
      return new TreeDataOptionConfig<TFolder, TItem>(undefined, folderChildren);
    }

  }
}

export module Data {

  export function FromList<TModel extends WithId>(): IListDataSourceConfig<TModel> {
    return new ListDataSourceConfig<TModel>();
  }

  export module FromTree {

    export function WithItemParent<TFolder extends WithId, TItem extends WithId>(parentId: Selection<TItem, string>) {
      return new TreeDataOptionConfig<TFolder, TItem>(parentId, undefined);
    }

    export function WithFolderChildren<TFolder extends WithId, TItem extends WithId>(folderChildren: Selection<TFolder, TItem[]>) {
      return new TreeDataOptionConfig<TFolder, TItem>(undefined, folderChildren);
    }

  }
}
