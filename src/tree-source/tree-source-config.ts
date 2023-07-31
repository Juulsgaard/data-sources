import {
  TreeDataSourceOptions, TreeFolderActionOptions, TreeFolderMap, TreeFolderNavigationOptions,
  TreeHiddenSearchColumnConfig, TreeHiddenSortColumnConfig, TreeItemActionOptions, TreeItemMap,
  TreeItemNavigationOptions, TreeMoveActions, TreeRowConfig, TreeSearchColumnConfig, TreeSortConfig
} from "./tree-data";
import {
  RenderDataTypes, RenderDataValueType, RenderValueDataType, SortingTypes, SortingValueType
} from "../models/render-types";
import {getSortingTypeSorting} from "../lib/sorting";
import {TreeDataSource} from "./tree-data-source";
import {ITreeFolderFilterService, ITreeItemFilterService} from "../filtering/filter-service";
import {ISorted, sortByIndexAsc} from "../lib/index-sort";
import {
  arrToObj, Conditional, getSelectorFn, KeysOfTypeOrNull, lowerFirst, Selection, WithId
} from "@juulsgaard/ts-tools";

//<editor-fold desc="Option Builder">
export class TreeDataOptionConfig<TFolder extends WithId, TItem extends WithId> {

  private readonly options: TreeDataSourceOptions<TFolder, TItem>;

  constructor(itemParentId?: Selection<TItem, string>, folderChildren?: Selection<TFolder, TItem[]>) {
    this.options = {
      itemParentId,
      folderChildren,
      folderActions: [],
      itemActions: [],
      folderFlags: [],
      itemFlags: [],
      moveActions: {}
    };
  }

  /**
   * Define a parent property on the folder type
   * This will allow for an infinitely nested tree structure
   * @param parentId - The parentId prop
   */
  withFolderParent(parentId: Selection<TFolder, string | undefined>) {
    this.options.folderParentId = parentId;
    return this;
  }

  /**
   * Indicate that the folders should be sorted using an index property
   */
  withSortedFolders(): Conditional<TFolder, ISorted, TreeDataOptionConfig<TFolder, TItem>> {
    this.options.folderSort = sortByIndexAsc as unknown as (a: TFolder, b: TFolder) => number;
    return this as any;
  }

  /**
   * Add sorting to the folders in tree view
   * @param sort
   */
  withFolderSort(sort: (a: TFolder, b: TFolder) => number) {
    this.options.folderSort = sort;
    return this;
  }

  /**
   * Indicate that the items should be sorted using an index property
   */
  withSortedItems(): Conditional<TItem, ISorted, TreeDataOptionConfig<TFolder, TItem>> {
    this.options.itemSort = sortByIndexAsc as unknown as (a: TItem, b: TItem) => number;
    return this as any;
  }

  /**
   * Add sorting to the items in tree view
   * @param sort
   */
  withItemSort(sort: (a: TItem, b: TItem) => number) {
    this.options.itemSort = sort;
    return this;
  }

  /**
   * Add a filter service for the folders
   * @param service - The filter service
   */
  withFolderFilter(service: ITreeFolderFilterService<TFolder>) {
    this.options.folderFilterService = service;
    return this;
  }

  /**
   * Add a filter service for the items
   * @param service - The filter service
   */
  withItemFilter(service: ITreeItemFilterService<TItem>) {
    this.options.itemFilterService = service;
    return this;
  }

  /**
   * Add an action that can be performed on a folder
   * @param name - The display name of the Action
   * @param icon - The icon for the Action
   * @param action - The action to be performed
   * @param options - Options to configure the action
   */
  addFolderAction(name: string, icon: string, action: TreeFolderMap<TFolder, TItem, any>, options?: TreeFolderActionOptions<TFolder, TItem>) {
    this.options.folderActions.push({
      name,
      icon,
      action,
      ...options
    });
    return this;
  }

  /**
   * Add a navigation action that can be performed on a folder
   * @param name - The display name of the Action
   * @param icon - The icon for the Action
   * @param route - A generator for the route to use for navigation
   * @param options - Options to configure the action
   */
  addFolderNavigation(name: string, icon: string, route: TreeFolderMap<TFolder, TItem, string[]>, options?: TreeFolderNavigationOptions<TFolder, TItem>) {
    this.options.folderActions.push({
      name,
      icon,
      route,
      ...options
    });
    return this;
  }

  /**
   * Define a flag for folders
   * Flags are optional icons that can be shown next to folders
   * @param name - The name of the flag
   * @param icon - The icon used for rendering the flag
   * @param filter - A filter to determine if the flag should be shown
   * @param inactiveIcon - Define an icon for when the flag is not active
   */
  addFolderFlag(name: string, icon: string, filter: TreeFolderMap<TFolder, TItem, boolean>, inactiveIcon?: string) {
    this.options.folderFlags.push({name, icon, filter, inactiveIcon});
    return this;
  }

  /**
   * Add an action that can be performed on an item
   * @param name - The display name of the Action
   * @param icon - The icon for the Action
   * @param action - The action to be performed
   * @param options - Options to configure the action
   */
  addItemAction(name: string, icon: string, action: TreeItemMap<TFolder, TItem, any>, options?: TreeItemActionOptions<TFolder, TItem>) {
    this.options.itemActions.push({
      name,
      icon,
      action,
      ...options
    });
    return this;
  }

  /**
   * Add a navigation action that can be performed on a folder
   * @param name - The display name of the Action
   * @param icon - The icon for the Action
   * @param route - A generator for the route to use for navigation
   * @param options - Options to configure the action
   */
  addItemNavigation(name: string, icon: string, route: TreeItemMap<TFolder, TItem, string[]>, options?: TreeItemNavigationOptions<TFolder, TItem>) {
    this.options.itemActions.push({
      name,
      icon,
      route,
      ...options
    });
    return this;
  }

  /**
   * Define a flag for items
   * Flags are optional icons that can be shown next to items
   * @param name - The name of the flag
   * @param icon - The icon used for rendering the flag
   * @param filter - A filter to determine if the flag should be shown
   * @param inactiveIcon - Define an icon for when the flag is not active
   */
  addItemFlag(name: string, icon: string, filter: TreeItemMap<TFolder, TItem, boolean>, inactiveIcon?: string) {
    this.options.itemFlags.push({name, icon, filter, inactiveIcon});
    return this;
  }

  /**
   * Define actions for moving and relocating items
   * @param actions
   */
  addMoveActions(actions: TreeMoveActions) {
    this.options.moveActions = actions;
    return this;
  }

  /**
   * Add Tree Rendering to this config
   */
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
          ): ITreeDataSourceConfig<TFolder, TItem> =>
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

  /**
   * Don't add Tree Rendering
   * This will make it so that this config can only be used for searching
   */
  asSearchOnly(): ITreeDataSourceConfig<TFolder, TItem> {
    return new TreeDataSourceConfig<TFolder, TItem>(this.options);
  }
}

//</editor-fold>

//<editor-fold desc="Table Builder">

//<editor-fold desc="Types">
type SearchColumnConfigs<TFolder extends WithId, TItem extends WithId> = {
  [key in keyof typeof RenderDataTypes as Uncapitalize<key>]: SearchColumnConfig<TFolder, TItem, RenderDataValueType<typeof RenderDataTypes[key]>|undefined>
};

type SearchColumnItemConfigs<TFolder extends WithId, TItem extends WithId, TData> = {
  [key in keyof typeof RenderDataTypes as Uncapitalize<key>]: SearchColumnItemConfig<TFolder, TData, TItem, RenderDataValueType<typeof RenderDataTypes[key]>|undefined>
};

type ColumnCreator<TFolder extends WithId, TItem extends WithId> = {
  /** Define a column including the folders */
  folder: SearchColumnConfigs<TFolder, TItem>,
  /** Define a column that does not include folders */
  noFolder: (id: string, title?: string) => SearchColumnMidConfig<TFolder, TItem, undefined>,
  /** Create a column that displays the path */
  path: (getName: TreeFolderMap<TFolder, TItem, string>) => ITreeDataSourceConfig<TFolder, TItem>,
};

type SearchColumnCreator<TFolder extends WithId, TItem extends WithId> = {
  /** Add a search column for folders */
  folder(id: string, map: TreeFolderMap<TFolder, TItem, string|undefined>, weight?: number): ITreeDataSourceConfig<TFolder, TItem>;
  /** Add a search column for items */
  item(id: string, map: TreeItemMap<TFolder, TItem, string|undefined>, weight?: number): ITreeDataSourceConfig<TFolder, TItem>;
};

interface ITreeDataSourceConfig<TFolder extends WithId, TItem extends WithId> {

  /**
   * Add a column
   * These columns will be rendered
   */
  column: ColumnCreator<TFolder, TItem>;

  /**
   * Add a hidden search column
   * These columns are only used for searching and won't be rendered
   */
  search: SearchColumnCreator<TFolder, TItem>;

  /** Finish building the Data Source */
  finish(): TreeDataSource<TFolder, TItem>;
}
//</editor-fold>

class TreeDataSourceConfig<TFolder extends WithId, TItem extends WithId> implements ITreeDataSourceConfig<TFolder, TItem> {

  public readonly searchColumns: TreeSearchColumnConfig<TFolder, unknown, TItem, unknown>[] = [];
  public readonly hiddenSearchColumns: TreeHiddenSearchColumnConfig<TFolder, TItem>[] = [];

  // TODO: Add config builder for sort columns
  public readonly hiddenSortColumns: TreeHiddenSortColumnConfig<TFolder, TItem, unknown>[] = [];

  column: ColumnCreator<TFolder, TItem>;
  search: SearchColumnCreator<TFolder, TItem>;

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
class SearchColumnConfig<TFolder extends WithId, TItem extends WithId, TData> {

  constructor(private type: RenderValueDataType<TData>, private rootConfig: TreeDataSourceConfig<TFolder, TItem>) {
  }

  /**
   * Use an existing property as a column
   * @param key - The property to use
   * @param title - The name of the column
   */
  prop(key: KeysOfTypeOrNull<TFolder, TData> & string, title?: string) {
    return this.continue({
      id: key,
      title,
      folder: {
        mapData: getSelectorFn(key),
        dataType: this.type
      }
    });
  }

  /**
   * Create a new column using a custom mapping
   * @param id - The ID of the column
   * @param title - The name of the column
   * @param map - The data mapping for the column
   */
  add(id: string, title: string, map: TreeFolderMap<TFolder, TItem, TData|undefined>) {
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

class SearchColumnMidConfig<TFolder extends WithId, TItem extends WithId, TData> {

  /** Include items in the column */
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

  /** Don't include items in the column */
  noItem() {
    return new SearchColumnFinalConfig<TFolder, TData, TItem, void>(
      {
        ...this.partialConfig,
        item: {mapData: () => undefined, dataType: RenderDataTypes.Void}
      },
      this.rootConfig
    );
  }

}

class SearchColumnItemConfig<TFolder extends WithId, TFolderData, TItem extends WithId, TItemData> {

  constructor(
    private partialConfig: Omit<TreeSearchColumnConfig<TFolder, TFolderData, TItem, any>, 'item'>,
    private type: RenderValueDataType<TItemData>,
    private rootConfig: TreeDataSourceConfig<TFolder, TItem>
  ) {
  }

  /**
   * Use an existing property for the item data
   * @param key - The property to use
   */
  prop(key: KeysOfTypeOrNull<TItem, TItemData>) {
    return new SearchColumnFinalConfig<TFolder, TFolderData, TItem, TItemData>(
      {
        ...this.partialConfig,
        item: {mapData: getSelectorFn(key), dataType: this.type}
      },
      this.rootConfig
    );
  }

  /**
   * Generate item data for the columns using a custom mapping
   * @param map - The data mapping for the column
   */
  map(map: TreeItemMap<TFolder, TItem, TItemData|undefined>) {
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

class SearchColumnFinalConfig<TFolder extends WithId, TFolderData, TItem extends WithId, TItemData> {

  constructor(
    private config: TreeSearchColumnConfig<TFolder, TFolderData, TItem, TItemData>,
    private rootConfig: TreeDataSourceConfig<TFolder, TItem>
  ) {
  }

  /**
   * Add sorting capabilities to the column
   * @param mapFolder - Map folder data for the sorting
   * @param mapItem - Map the item data for the sorting
   * @param type - The data type for the sorting
   */
  withSorting<T extends SortingTypes>(
    type: T,
    mapFolder: TreeFolderMap<TFolder, TItem, SortingValueType<T>|undefined>,
    mapItem: TreeItemMap<TFolder, TItem, SortingValueType<T>|undefined>,
  ) {
    this.config.sorting = {
      folderSortData: mapFolder,
      itemSortData: mapItem,
      sortFn: getSortingTypeSorting(type)
    } as TreeSortConfig<TFolder, TItem, SortingValueType<T>>;
    return this;
  }

  /**
   * Use this column for searching
   * @param weight - Set a custom weight for the search
   */
  includeInSearch(weight?: number) {
    this.config.searching = {
      mapFolder: (folder, meta) => this.config.folder.mapData(folder, meta)?.toString(),
      mapItem: (item, meta) => this.config.item.mapData(item, meta)?.toString(),
      weight
    };
    return this;
  }

  /**
   * Finish defining the column
   */
  done(): ITreeDataSourceConfig<TFolder, TItem> {
    this.rootConfig.searchColumns.push(this.config);
    return this.rootConfig;
  }

}

//</editor-fold>
