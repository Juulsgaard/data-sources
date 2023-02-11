import {
    RenderValueDataType, RenderDataTypes, SortableRenderDataTypes, SortableValueTypes, SortingTypes,
    SortingValueType
} from "../models/render-types";
import {sortAlphAsc, sortBoolAsc, sortDateAsc, SortFn, sortNumAsc} from "@consensus-labs/ts-tools";


export function getRenderDataTypeSorting<TVal extends SortableValueTypes>(type: RenderValueDataType<TVal>): SortFn<TVal|undefined>;
export function getRenderDataTypeSorting<TVal>(type: RenderValueDataType<TVal>): RenderTypeSort<TVal>;
export function getRenderDataTypeSorting(type: RenderDataTypes): SortFn<any|undefined>|undefined {
    switch (type) {
        case RenderDataTypes.Number:
        case RenderDataTypes.Decimal:
            return sortNumAsc();
        case RenderDataTypes.String:
        case RenderDataTypes.Icon:
        case RenderDataTypes.Image:
        case RenderDataTypes.Html:
            return sortAlphAsc();
        case RenderDataTypes.Date:
        case RenderDataTypes.DateTime:
        case RenderDataTypes.Time:
            return sortDateAsc();
        case RenderDataTypes.Bool:
            return sortBoolAsc();
        case RenderDataTypes.Template:
        case RenderDataTypes.Void:
            return undefined;
    }
}

type RenderTypeSort<TVal> = TVal extends SortableValueTypes ? SortFn<TVal|undefined> : undefined;

export function getSortingTypeSorting<T extends SortingTypes>(type: T): SortFn<SortingValueType<T>|undefined> {
    switch (type) {
        case SortingTypes.Alph:
            return sortAlphAsc() as SortFn<SortingValueType<T> | undefined>;
        case SortingTypes.Num:
            return sortNumAsc() as SortFn<SortingValueType<T> | undefined>;
        case SortingTypes.Date:
            return sortDateAsc() as SortFn<SortingValueType<T> | undefined>;
        case SortingTypes.Bool:
            return sortBoolAsc() as SortFn<SortingValueType<T> | undefined>;
    }
    return undefined!;
}
