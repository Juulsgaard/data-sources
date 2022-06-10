
export type ThemeColor = 'primary'|'accent'|'warn';

export interface Sort {
  /** The id of the column being sorted. */
  active: string;
  /** The sort direction. */
  direction: 'asc'|'desc'|'';
}

export interface Page {
  /** The current page index. */
  pageIndex: number;
  /** The current page size */
  pageSize: number;
}
