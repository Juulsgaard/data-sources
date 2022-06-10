
export interface DetachedSearchData<TData> {
  id: string;
  model: TData;
  name: string;
  icon?: string;
  extra?: string;
  score: number;
}
