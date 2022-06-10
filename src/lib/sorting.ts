import {RenderDataPrimaryTypes, RenderDataType, RenderDataTypes} from "../models/render-types";
import {sortAlphAsc, sortBoolAsc, sortDateAsc, SortFn, sortNumAsc} from "@consensus-labs/ts-tools";


export function getRenderDataTypeSorting<TVal extends RenderDataPrimaryTypes>(type: RenderDataType<TVal>): SortFn<TVal|undefined> {
    switch (type) {
        case RenderDataTypes.Number:
        case RenderDataTypes.Decimal:
            return sortNumAsc() as SortFn<TVal|undefined>;
        case RenderDataTypes.String:
        case RenderDataTypes.Icon:
        case RenderDataTypes.HTML:
            return sortAlphAsc() as SortFn<TVal|undefined>;
        case RenderDataTypes.Date:
            return sortDateAsc() as SortFn<TVal|undefined>;
        case RenderDataTypes.Bool:
            return sortBoolAsc() as SortFn<TVal|undefined>;
    }
    return (a: TVal|undefined, b: TVal|undefined) => 0;
}
