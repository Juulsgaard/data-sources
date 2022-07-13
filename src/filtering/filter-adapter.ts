import {Observable} from "rxjs";

export type FilterSaveState = Record<string, string|number|string[]|number[]|undefined>;

export interface FilterAdapter {

  writeState(state: FilterSaveState): Promise<void>;
  readState(): Observable<FilterSaveState>;

}
