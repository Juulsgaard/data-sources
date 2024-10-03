
interface SearchKeyOptions {
  weight?: number;
}

export interface PathSearchKey extends SearchKeyOptions {
  path: string[];
}

export interface FnSearchKey<T> extends SearchKeyOptions {
  name: string;
  getValue: (value: T) => string,
}

export type SearchKey<T> = PathSearchKey | FnSearchKey<T>;

export interface SearchResult<T> {
  value: T;
  score: number;
}
