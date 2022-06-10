import {RenderDataPrimaryTypes, RenderDataType, RenderDataTypes} from "../models/render-types";
import {SortFn} from "./types";


export function getRenderDataTypeSorting<TVal extends RenderDataPrimaryTypes>(type: RenderDataType<TVal>): SortFn<TVal|undefined> {
    switch (type) {
        case RenderDataTypes.Number:
        case RenderDataTypes.Decimal:
            return sortNum as SortFn<TVal|undefined>;
        case RenderDataTypes.String:
        case RenderDataTypes.Icon:
        case RenderDataTypes.HTML:
            return sortString as SortFn<TVal|undefined>;
        case RenderDataTypes.Date:
            return sortDate as SortFn<TVal|undefined>;
        case RenderDataTypes.Bool:
            return sortBool as SortFn<TVal|undefined>;
    }
    return (a: TVal|undefined, b: TVal|undefined) => 0;
}

function sortNum<T extends number>(a: T, b: T) {
    return (a ?? 0) - (b ?? 0);
}

function sortString<T extends string>(a: T, b: T) {
    return (a ?? '').localeCompare(b ?? '');
}

function sortDate<T extends Date>(a: T, b: T) {
    return (a?.getTime() ?? 0) - (b?.getTime() ?? 0);
}

function sortBool<T extends boolean>(a: T, b: T) {
    return a ? (b ? 0 : 1) : (b ? -1 : 0);
}
