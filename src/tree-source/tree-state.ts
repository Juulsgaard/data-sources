import {WithId} from "@juulsgaard/ts-tools";
import {AnyTreeSelection} from "./tree-selection";
import {AnyTreeRange} from "./tree-range";

export type AnyTreeState<TFolder extends WithId, TItem extends WithId> =
  | AnyTreeSelection<TFolder, TItem>
  | AnyTreeRange<TFolder, TItem>;
