
import {TreeFolderFilterService, TreeItemFilterService} from "../filter.service";
import {RenderDataType} from "../models/render-types";
import {BulkRelocateModel, MoveModel} from "../models/move";
import {Selection, SimpleObject, SortFn} from "@consensus-labs/ts-tools";
import {ThemeColor} from "../lib/types";

//<editor-fold desc="Tree Data Structure">
/**
 * Display data for Folders in Tree View
 */
export interface TreeFolderData<TFolder, TItem> {
  model: TreeFolder<TFolder, TItem>
  items: TreeItemData<TFolder, TItem>[];
  folders: TreeFolderData<TFolder, TItem>[];
  data: TreeRowData;
  actions: TreeFolderActionConfig<TFolder, TItem>[];
}

/**
 * Display data for Items in Tree View
 */
export interface TreeItemData<TFolder, TItem> {
  model: TreeItem<TFolder, TItem>;
  data: TreeRowData;
  actions: TreeItemActionConfig<TFolder, TItem>[];
}

/**
 * Mapped Row data based on TreeRowConfig
 * Same structure for both Folder and Item
 */
export interface TreeRowData {
  icon: string;
  name: string;
  bonus?: string;
  tooltip?: string;
}

//</editor-fold>

//<editor-fold desc="Search Data Structure">

export interface TreeFolderSearchData<TFolder, TItem> {
  search: Record<string, string>;
  isFolder: true;
  model: TreeFolder<TFolder, TItem>;
}

export interface TreeItemSearchData<TFolder, TItem> {
  search: Record<string, string>;
  isFolder: false;
  model: TreeItem<TFolder, TItem>;
}

export type TreeSearchData<TFolder, TItem> = TreeFolderSearchData<TFolder, TItem> | TreeItemSearchData<TFolder, TItem>;

export interface TreeFolderSearchRowData<TFolder, TItem> {
  data: SimpleObject;
  isFolder: true;
  model: TreeFolder<TFolder, TItem>;
  actions: TreeFolderActionConfig<TFolder, TItem>[];
}

export interface TreeItemSearchRowData<TFolder, TItem> {
  data: SimpleObject;
  isFolder: false;
  model: TreeItem<TFolder, TItem>;
  actions: TreeItemActionConfig<TFolder, TItem>[];
}

export type TreeSearchRowData<TFolder, TItem> = TreeFolderSearchRowData<TFolder, TItem> | TreeItemSearchRowData<TFolder, TItem>;

//</editor-fold>

//<editor-fold desc="Column Behaviour Configs">
/**
 * Defines sort behaviour for Folder / Item
 */
export interface TreeSortConfig<TFolder, TItem, TData> {
  folderSortData: (data: TFolder, meta: TreeFolderMeta<TFolder, TItem>) => TData;
  itemSortData: (data: TItem, meta: TreeItemMeta<TFolder, TItem>) => TData;
  sortFn: SortFn<TData|undefined>;
}

/**
 * Defines search behaviour for Folder / Item
 */
export interface TreeSearchConfig<TFolder, TItem> {
  mapFolder?: TreeFolderMap<TFolder, TItem, string|undefined>;
  mapItem?: TreeItemMap<TFolder, TItem, string|undefined>;
  weight?: number;
}

//</editor-fold>

//<editor-fold desc="Search Columns">
/**
 * Configuration for Tree Search Column
 */
export interface TreeSearchColumnConfig<TFolder, TFolderData, TItem, TItemData> {
  id: string;
  title?: string;

  folder: TreeSearchColumnConfigUnit<TFolder, TreeFolderMeta<TFolder, TItem>, TFolderData>;
  item: TreeSearchColumnConfigUnit<TItem, TreeItemMeta<TFolder, TItem>, TItemData>;

  searching?: TreeSearchConfig<TFolder, TItem>
  sorting?: TreeSortConfig<TFolder, TItem, any>;
}

/**
 * Folder / Item specific configs for a Tree Search Column
 */
export interface TreeSearchColumnConfigUnit<TModel, TMeta, TData> {
  mapData: (data: TModel, meta: TMeta) => TData;
  dataType: RenderDataType<TData>;
}

//</editor-fold>

//<editor-fold desc="Hidden Columns">
/**
 * Config for a Tree Column that isn't show in Search Results
 */
export interface TreeHiddenSortColumnConfig<TFolder, TItem, TData> extends TreeSortConfig<TFolder, TItem, TData> {
  id: string;
  title: string;
}

export interface TreeHiddenSearchColumnConfig<TFolder, TItem> extends TreeSearchConfig<TFolder, TItem> {
  id: string;
}

//</editor-fold>

//<editor-fold desc="Base Configs">
/**
 * The main configuration for a Tree Data Source
 * This config defines basic behaviour for the Data Source
 */
export interface TreeDataSourceOptions<TFolder, TItem> {
  itemParentId?: Selection<TItem, string>;
  folderChildren?: Selection<TFolder, TItem[]>;
  folderParentId?: Selection<TFolder, string|undefined>;

  folderFilterService?: TreeFolderFilterService<unknown, TFolder>;
  itemFilterService?: TreeItemFilterService<unknown, TItem>;

  folderSort?: SortFn<TFolder>;
  itemSort?: SortFn<TItem>;

  folderActions: TreeFolderActionConfig<TFolder, TItem>[];
  itemActions: TreeItemActionConfig<TFolder, TItem>[];

  moveActions: TreeMoveActions;
}

export interface TreeMoveActions {
  moveFolder?: (data: MoveModel) => Promise<unknown>|void;
  moveItem?: (data: MoveModel) => Promise<unknown>|void;
  relocateFolders?: (data: BulkRelocateModel) => Promise<unknown>|void;
  relocateItems?: (data: BulkRelocateModel) => Promise<unknown>|void;
}

/**
 * Configuration describing the data for the tree rows
 */
export interface TreeRowConfig<TFolder, TItem> {
  folderIcon?: TreeFolderMap<TFolder, TItem, string|undefined>;
  itemIcon?: TreeItemMap<TFolder, TItem, string|undefined>;

  folderName: TreeFolderMap<TFolder, TItem, string>;
  itemName: TreeItemMap<TFolder, TItem, string>;

  folderBonus?: TreeFolderMap<TFolder, TItem, string|undefined>;
  itemBonus?: TreeItemMap<TFolder, TItem, string|undefined>;

  folderTooltip?: TreeFolderMap<TFolder, TItem, string|undefined>;
  itemTooltip?: TreeItemMap<TFolder, TItem, string|undefined>;
}

//</editor-fold>

//<editor-fold desc="Base Data">
/**
 * The base representation of Items
 */
export interface BaseTreeItem<TItem> extends BaseTreeItemMeta {
  model: TItem;
}

/**
 * The base metadata for items
 */
export interface BaseTreeItemMeta {
  folderId: string;
}

/**
 * The base representation of Folders
 */
export interface BaseTreeFolder<TFolder> extends BaseTreeFolderMeta {
  model: TFolder;
}

/**
 * The base metadata for Folders
 */
export interface BaseTreeFolderMeta {
  parentId?: string;
}
//</editor-fold>

//<editor-fold desc="Full Data">
/**
 * The full representation of Folders
 */
export interface TreeFolder<TFolder, TItem> extends TreeFolderMeta<TFolder, TItem> {
  model: TFolder;
}

/**
 * Full metadata for Folders
 */
export interface TreeFolderMeta<TFolder, TItem> extends BaseTreeFolderMeta {
  path: TreeFolder<TFolder, TItem>[];
  items: TreeItem<TFolder, TItem>[];
  folders: TreeFolder<TFolder, TItem>[];
  itemCount: number;
  folderCount: number;
}

/**
 * The full representation of Items
 */
export interface TreeItem<TFolder, TItem> extends TreeItemMeta<TFolder, TItem> {
  model: TItem;
}

/**
 * Full metadata for Items
 */
export interface TreeItemMeta<TFolder, TItem> extends BaseTreeItemMeta {
  folder: TreeFolder<TFolder, TItem>
}
//</editor-fold>

//<editor-fold desc="Folder List View">
/**
 * A data structure for displaying a detailed view of a single folder, and it's content
 */
export interface TreeAsideData<TFolder, TItem> {

  model?: TreeFolder<TFolder, TItem>
  name: string;
  bonus?: string;
  icon: string;
  path: TreePathData<TFolder, TItem>[];

  actions: TreeFolderActionConfig<TFolder, TItem>[];

  folders: TreeAsideFolderData<TFolder, TItem>[];
  items: TreeAsideItemData<TFolder, TItem>[];
}

/**
 * A data structure for Folders inside the TreeFolderListData model
 */
export interface TreeAsideFolderData<TFolder, TItem> {
  name: string;
  icon?: string;
  bonus?: string;
  model: TreeFolder<TFolder, TItem>;
  actions: TreeFolderActionConfig<TFolder, TItem>[];
}

/**
 * A data structure for Items inside the TreeFolderListData model
 */
export interface TreeAsideItemData<TFolder, TItem> {
  name: string;
  icon?: string;
  bonus?: string;
  model: TreeItem<TFolder, TItem>;
  actions: TreeItemActionConfig<TFolder, TItem>[];
}

/**
 * Path data for TreeFolderListData
 */
export interface TreePathData<TFolder, TItem> {
  name: string;
  model: TreeFolder<TFolder, TItem>;
}

//</editor-fold>

//<editor-fold desc="Actions">
/**
 * A config defining an action relating to a Folder
 */
export interface TreeFolderActionConfig<TFolder, TItem> extends TreeFolderActionOptions<TFolder, TItem> {
  name: string;
  icon: string;
  action: (data: TFolder, meta: TreeFolderMeta<TFolder, TItem>) => any;
}

/**
 * Optional config for TreeFolderActionConfig
 */
export interface TreeFolderActionOptions<TFolder, TItem> {
  filter?: (data: TFolder, meta: TreeFolderMeta<TFolder, TItem>) => boolean;
  color?: ThemeColor;
}

/**
 * A config defining an action relating to an Item
 */
export interface TreeItemActionConfig<TFolder, TItem> extends TreeItemActionOptions<TFolder, TItem> {
  name: string;
  icon: string;
  action: TreeItemMap<TFolder, TItem, any>;
}

/**
 * Optional config for TreeItemActionConfig
 */
export interface TreeItemActionOptions<TFolder, TItem> {
  filter?: TreeItemMap<TFolder, TItem, boolean>;
  color?: ThemeColor;
}

//</editor-fold>

export type TreeFolderMap<TFolder, TItem, TData> = (folder: TFolder, meta: TreeFolderMeta<TFolder, TItem>) => TData;
export type TreeItemMap<TFolder, TItem, TData> = (item: TItem, meta: TreeItemMeta<TFolder, TItem>) => TData;
