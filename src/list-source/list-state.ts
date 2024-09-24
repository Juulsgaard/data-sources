import {WithId} from "@juulsgaard/ts-tools";
import {ListRange} from "./list-range";
import {ListSelection} from "./list-selection";

export type AnyListState<T extends WithId> = ListSelection<T> | ListRange<T>;
