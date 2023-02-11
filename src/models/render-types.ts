export enum RenderDataTypes {
  String = 'String',
  Html = 'HTML',
  Number = 'Number',
  Decimal = 'Decimal',
  Bool = 'Bool',
  Date = 'Date',
  DateTime = 'DateTime',
  Time = 'Time',
  Icon = 'Icon',
  Image = 'Image',
  Template = 'Template',
  Void = 'Void',
}

const {Template, Void, ...sortableRenderDataTypes} = RenderDataTypes;
export const SortableRenderDataTypes = sortableRenderDataTypes;
export type SortableRenderDataTypes = Exclude<RenderDataTypes, RenderDataTypes.Template | RenderDataTypes.Void>;

/**
 * Map primary types to RenderDataType
 */
export type RenderValueDataType<T> = StrictRenderDataType<T> | RenderDataTypes.Template;

type StrictRenderDataType<T> =
  T extends string ? RenderDataTypes.String | RenderDataTypes.Html | RenderDataTypes.Icon | RenderDataTypes.Image :
    T extends Date ? RenderDataTypes.Date | RenderDataTypes.DateTime | RenderDataTypes.Time :
      T extends number ? RenderDataTypes.Number | RenderDataTypes.Decimal :
        T extends boolean ? RenderDataTypes.Bool :
          T extends void ? RenderDataTypes.Void :
            never;

/**
 * Convert RenderDataType to primary type
 */
export type RenderDataValueType<T extends RenderDataTypes> =
  T extends RenderDataTypes.String | RenderDataTypes.Html | RenderDataTypes.Icon | RenderDataTypes.Image ? string :
    T extends RenderDataTypes.Date | RenderDataTypes.DateTime | RenderDataTypes.Time ? Date :
      T extends RenderDataTypes.Number | RenderDataTypes.Decimal ? number :
        T extends RenderDataTypes.Bool ? boolean :
          T extends RenderDataTypes.Template ? unknown :
            T extends RenderDataTypes.Void ? void :
              never;

export type SortableValueTypes = string | Date | number | boolean;

export enum SortingTypes {
  Alph = "Alphabetical",
  Num = "Numerical",
  Date = "Dates",
  Bool = "Boolean"
}

export type SortingValueType<T extends SortingTypes> =
  T extends SortingTypes.Alph ? string :
    T extends SortingTypes.Date ? Date :
      T extends SortingTypes.Num ? number :
        T extends SortingTypes.Bool ? boolean :
          never;
