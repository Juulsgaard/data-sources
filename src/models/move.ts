
export interface MoveModel {
  id: string;
  index: number
}

export interface BulkRelocateModel {
  ids: string[];
  parentId?: string;
}
