import {
  TreeDataSourceOptions, TreeFolderActionOptions, TreeFolderMap, TreeFolderMeta, TreeHiddenSearchColumnConfig, TreeHiddenSortColumnConfig,
  TreeItemActionOptions, TreeItemMap, TreeMoveActions, TreeRowConfig, TreeSearchColumnConfig, TreeSortConfig
} from "./tree-data";
import {RenderDataPrimaryTypes, RenderDataType, RenderDataTypeLookup, RenderDataTypes} from "../models/render-types";
import {getRenderDataTypeSorting} from "../lib/sorting";
import {TreeDataSource} from "./tree-data-source";
import {TreeFolderFilterService, TreeItemFilterService} from "../filtering/filter-service";
import {ISorted, sortByIndexAsc} from "../lib/index-sort";
import {arrToObj, Conditional, getSelectorFn, KeysOfType, lowerFirst, Selection, WithId} from "@consensus-labs/ts-tools";

//<editor-fold desc="Option Builder">
export class TreeDataOptionConfig<TFolder extends WithId, TItem extends WithId> {

  private readonly options: TreeDataSourceOptions<TFolder, TItem>;

  constructor(itemParentId?: Selection<TItem, string>, folderChildren?: Selection<TFolder, TItem[]>) {
    this.options = {
      itemParentId,
      folderChildren,
      folderActions: [],
      itemActions: [],
      moveActions: {}
    };
  }

  withFolderParent(parentId: Selection<TFolder, string | undefined>) {
    this.options.folderParentId = parentId;
    return this;
  }

  withSortedFolders(): Conditional<TFolder, ISorted, TreeDataOptionConfig<TFolder, TItem>> {
    this.options.folderSort = sortByIndexAsc as unknown as (a: TFolder, b: TFolder) => number;
    return this as any;
  }

  withFolderSort(sort: (a: TFolder, b: TFolder) => number) {
    this.options.folderSort = sort;
    return this;
  }

  withSortedItems(): Conditional<TItem, ISorted, TreeDataOptionConfig<TFolder, TItem>> {
    this.options.itemSort = sortByIndexAsc as unknown as (a: TItem, b: TItem) => number;
    return this as any;
  }

  withItemSort(sort: (a: TItem, b: TItem) => number) {
    this.options.itemSort = sort;
    return this;
  }

  withFolderFilter(service: TreeFolderFilterService<any, TFolder>) {
    this.options.folderFilterService = service;
    return this;
  }

  withItemFilter(service: TreeItemFilterService<any, TItem>) {
    this.options.itemFilterService = service;
    return this;
  }

  addFolderAction(name: string, icon: string, action: (data: TFolder, meta: TreeFolderMeta<TFolder, TItem>) => any, options?: TreeFolderActionOptions<TFolder, TItem>) {
    this.options.folderActions.push({
      name,
      icon,
      action,
      ...options
    });
    return this;
  }

  addItemAction(name: string, icon: string, action: TreeItemMap<TFolder, TItem, any>, options?: TreeItemActionOptions<TFolder, TItem>) {
    this.options.itemActions.push({
      name,
      icon,
      action,
      ...options
    });
    return this;
  }

  addMoveActions(actions: TreeMoveActions) {
    this.options.moveActions = actions;
    return this;
  }

  asTree() {
    return {
      folderRow: (
        getName: TreeFolderMap<TFolder, TItem, string>,
        getIcon?: TreeFolderMap<TFolder, TItem, string|undefined>|null,
        getBonus?: TreeFolderMap<TFolder, TItem, string|undefined>|null,
        getTooltip?: TreeFolderMap<TFolder, TItem, string|undefined>|null,
      ) => {
        const folderConfig: Pick<TreeRowConfig<TFolder, TItem>, 'folderName' | 'folderIcon' | 'folderBonus' | 'folderTooltip'> = {
          folderName: getName,
          folderIcon: getIcon ?? undefined,
          folderBonus: getBonus ?? undefined,
          folderTooltip: getTooltip ?? undefined,
        };
        return {
          itemRow: (
            getName: TreeItemMap<TFolder, TItem, string>,
            getIcon?: TreeItemMap<TFolder, TItem, string|undefined>|null,
            getBonus?: TreeItemMap<TFolder, TItem, string|undefined>|null,
            getTooltip?: TreeItemMap<TFolder, TItem, string|undefined>|null,
          ) =>
            new TreeDataSourceConfig(this.options, {
              ...folderConfig,
              itemName: getName,
              itemIcon: getIcon ?? undefined,
              itemBonus: getBonus ?? undefined,
              itemTooltip: getTooltip ?? undefined,
            })
        };
      }
    };
  }

  asSearchOnly() {
    return new TreeDataSourceConfig<TFolder, TItem>(this.options);
  }
}

//</editor-fold>

//<editor-fold desc="Table Builder">
type SearchColumnConfigs<TFolder extends WithId, TItem extends WithId> = {
  [key in keyof typeof RenderDataTypes as Uncapitalize<key>]: SearchColumnConfig<TFolder, TItem, RenderDataTypeLookup<typeof RenderDataTypes[key]>|undefined>
};
type SearchColumnItemConfigs<TFolder extends WithId, TItem extends WithId, TData extends RenderDataPrimaryTypes> = {
  [key in keyof typeof RenderDataTypes as Uncapitalize<key>]: SearchColumnItemConfig<TFolder, TData, TItem, RenderDataTypeLookup<typeof RenderDataTypes[key]>|undefined>
};

class TreeDataSourceConfig<TFolder extends WithId, TItem extends WithId> {
  public readonly searchColumns: TreeSearchColumnConfig<TFolder, unknown, TItem, unknown>[] = [];
  public readonly hiddenSearchColumns: TreeHiddenSearchColumnConfig<TFolder, TItem>[] = [];

  // TODO: Add config builder for sort columns
  public readonly hiddenSortColumns: TreeHiddenSortColumnConfig<TFolder, TItem, unknown>[] = [];

  column: {
    folder: SearchColumnConfigs<TFolder, TItem>,
    noFolder: (id: string, title?: string) => SearchColumnMidConfig<TFolder, TItem, undefined>,
    path: (getName: TreeFolderMap<TFolder, TItem, string>) => TreeDataSourceConfig<TFolder, TItem>,
  };

  search: {
    folder(id: string, map: TreeFolderMap<TFolder, TItem, string|undefined>, weight?: number): TreeDataSourceConfig<TFolder, TItem>;
    item(id: string, map: TreeItemMap<TFolder, TItem, string|undefined>, weight?: number): TreeDataSourceConfig<TFolder, TItem>;
  }

  constructor(
    public options: TreeDataSourceOptions<TFolder, TItem>,
    public treeConfig?: TreeRowConfig<TFolder, TItem>
  ) {

    this.column = {
      folder: arrToObj(
        Object.entries(RenderDataTypes),
        ([key]) => lowerFirst(key),
          ([_, type]) => new SearchColumnConfig<TFolder, TItem, any>(type as RenderDataTypes, this)
      ) as SearchColumnConfigs<TFolder, TItem>,

      noFolder: (id: string) => new SearchColumnMidConfig<TFolder, TItem, undefined>({
        id,
        folder: {mapData: () => undefined, dataType: RenderDataTypes.Void}
      }, this),

      path: (getName) => this.column
        .folder.string.add('path', 'Path', (_, x) => x.path.map(x => getName(x.model, x)).join('/'))
        .item.string.map((_, {folder}) => [
          ...folder.path.map(x => getName(x.model, x)),
          getName(folder.model, folder)
        ].join('/'))
        .done()
    };

    this.search = {
      folder: (id: string, map: TreeFolderMap<TFolder, TItem, string|undefined>, weight?: number) => {
        this.hiddenSearchColumns.push({mapFolder: map, id, weight});
        return this;
      },
      item: (id: string, map: TreeItemMap<TFolder, TItem, string|undefined>, weight?: number) => {
        this.hiddenSearchColumns.push({mapItem: map, id, weight});
        return this;
      }
    }
  }

  finish() {
    return new TreeDataSource<TFolder, TItem>(this.options, this.searchColumns, this.hiddenSearchColumns, this.hiddenSortColumns, this.treeConfig);
  }
}

//</editor-fold>

//<editor-fold desc="Column Builders">
class SearchColumnConfig<TFolder extends WithId, TItem extends WithId, TData extends RenderDataPrimaryTypes> {

  constructor(private type: RenderDataType<TData>, private rootConfig: TreeDataSourceConfig<TFolder, TItem>) {
  }

  prop(key: KeysOfType<TFolder, TData> & string, title?: string) {
    return this.continue({
      id: key,
      title,
      folder: {
        mapData: getSelectorFn(key),
        dataType: this.type
      }
    });
  }

  add(id: string, title: string, map: TreeFolderMap<TFolder, TItem, TData>) {
    return this.continue({
      id,
      title,
      folder: {
        mapData: map,
        dataType: this.type
      }
    });
  }

  private continue(config: Omit<TreeSearchColumnConfig<TFolder, TData, TItem, any>, 'item'>) {
    return new SearchColumnMidConfig<TFolder, TItem, TData>(config, this.rootConfig);
  }
}

class SearchColumnMidConfig<TFolder extends WithId, TItem extends WithId, TData extends RenderDataPrimaryTypes> {

  item: SearchColumnItemConfigs<TFolder, TItem, TData>;

  constructor(
    private partialConfig: Omit<TreeSearchColumnConfig<TFolder, TData, TItem, any>, 'item'>,
    private rootConfig: TreeDataSourceConfig<TFolder, TItem>
  ) {

    this.item = arrToObj(
      Object.entries(RenderDataTypes),
      ([key]) => lowerFirst(key),
      ([_, type]) => new SearchColumnItemConfig<TFolder, TData, TItem, any>(partialConfig, type as RenderDataTypes, rootConfig)
    ) as SearchColumnItemConfigs<TFolder, TItem, TData>;
  }

  noItem() {
    return new SearchColumnFinalConfig<TFolder, TData, TItem, undefined>(
      {
        ...this.partialConfig,
        item: {mapData: () => undefined, dataType: RenderDataTypes.Void}
      },
      this.rootConfig
    );
  }

}

class SearchColumnItemConfig<TFolder extends WithId, TFolderData extends RenderDataPrimaryTypes, TItem extends WithId, TItemData extends RenderDataPrimaryTypes> {

  constructor(
    private partialConfig: Omit<TreeSearchColumnConfig<TFolder, TFolderData, TItem, any>, 'item'>,
    private type: RenderDataType<TItemData>,
    private rootConfig: TreeDataSourceConfig<TFolder, TItem>
  ) {
  }

  prop(key: KeysOfType<TItem, TItemData>) {
    return new SearchColumnFinalConfig<TFolder, TFolderData, TItem, TItemData>(
      {
        ...this.partialConfig,
        item: {mapData: getSelectorFn(key), dataType: this.type}
      },
      this.rootConfig
    );
  }

  map(map: TreeItemMap<TFolder, TItem, TItemData>) {
    return new SearchColumnFinalConfig<TFolder, TFolderData, TItem, TItemData>(
      {
        ...this.partialConfig,
        item: {
          mapData: map,
          dataType: this.type
        }
      },
      this.rootConfig
    );
  }
}

class SearchColumnFinalConfig<TFolder extends WithId, TFolderData extends RenderDataPrimaryTypes, TItem extends WithId, TItemData extends RenderDataPrimaryTypes> {

  constructor(
    private config: TreeSearchColumnConfig<TFolder, TFolderData, TItem, TItemData>,
    private rootConfig: TreeDataSourceConfig<TFolder, TItem>
  ) {
  }

  withSorting<TSort>(
    mapFolder: TreeFolderMap<TFolder, TItem, TSort>,
    mapItem: TreeItemMap<TFolder, TItem, TSort>,
    type: RenderDataType<TSort>
  ) {
    this.config.sorting = {
      folderSortData: mapFolder,
      itemSortData: mapItem,
      sortFn: getRenderDataTypeSorting(type)
    } as TreeSortConfig<TFolder, TItem, TSort>;
    return this;
  }

  includeInSearch(weight?: number) {
    this.config.searching = {
      mapFolder: (folder, meta) => this.config.folder.mapData(folder, meta)?.toString(),
      mapItem: (item, meta) => this.config.item.mapData(item, meta)?.toString(),
      weight
    };
    return this;
  }

  done() {
    this.rootConfig.searchColumns.push(this.config);
    return this.rootConfig;
  }

}

//</editor-fold>
