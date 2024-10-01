export type FilterSaveState = Record<string, string|number|boolean|string[]|number[]|undefined>;
export type FilterReadState = Record<string, string|string[]>;
export type MappedReadState<T extends FilterSaveState> = {[key in keyof T]?: T[key] extends any[] ? string[]|string : string};

export interface FilterAdapter {

  writeState(state: FilterSaveState): Promise<void>;
  readState(): Promise<FilterReadState>;

}
