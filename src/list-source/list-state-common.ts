import {Signal} from "@angular/core";
import {WithId} from "@juulsgaard/ts-tools";

export interface IListState {
  readonly multiple: boolean;
  readonly empty: Signal<boolean>;
  clear(): void;
  toggleItem(item: string | WithId, state?: boolean): boolean|undefined;
  isActive(item: WithId | string): Signal<boolean>;
}
