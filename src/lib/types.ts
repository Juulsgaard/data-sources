
export type KeysOfType<T, TProp> = { [P in keyof T]-?: T[P] extends TProp ? P : never }[keyof T];
export type Conditional<T, TBase, TTrue, TFalse = never> = T extends TBase ? TTrue : TFalse;

export type Selection<TModel, TProp> = MapFunc<TModel, TProp> | KeysOfType<TModel, TProp>;
export type MapFunc<TModel, TProp> = ((x: TModel) => TProp);

export type SortFn<TModel> = (a: TModel, b: TModel) => number;
export type SimpleObject = Record<string, any>;

export type ThemeColor = 'primary'|'accent'|'warn';

export interface WithId {
  id: string;
}

export interface Sort {
  /** The id of the column being sorted. */
  active: string;
  /** The sort direction. */
  direction: 'asc'|'desc';
}

export interface Page {
  /** The current page index. */
  pageIndex: number;
  /** The current page size */
  pageSize: number;
}
