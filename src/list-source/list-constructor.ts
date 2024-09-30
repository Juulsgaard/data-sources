import {ListDataSourceConfig} from "./list-source-config";
import {WithId} from "@juulsgaard/ts-tools";
import {Injector} from "@angular/core";

export function listDataSource<T extends WithId>(options?: {injector?: Injector}): ListDataSourceConfig<T> {
  return new ListDataSourceConfig<T>(options);
}
