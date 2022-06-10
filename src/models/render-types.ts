export enum RenderDataTypes {
  Number = 'Number',
  String = 'String',
  HTML = 'HTML',
  Date = 'Date',
  Icon = 'Icon',
  Decimal = 'Decimal',
  Template = 'Template',
  Bool = 'Bool',
  Void = 'Void',
}

export type RenderDataPrimaryTypes = string|Date|number|boolean|null|undefined;

/**
 * Map primary types to RenderDataType
 */
export type RenderDataType<T> =
  T extends string ? RenderDataTypes.String | RenderDataTypes.HTML | RenderDataTypes.Icon :
    T extends Date ? RenderDataTypes.Date :
      T extends number ? RenderDataTypes.Number | RenderDataTypes.Decimal :
        T extends boolean ? RenderDataTypes.Bool :
          T extends null ? RenderDataTypes.Template :
            T extends void ? RenderDataTypes.Void :
              never;

/**
 * Convert RenderDataType to primary type
 */
export type RenderDataTypeLookup<T extends RenderDataTypes> =
  T extends RenderDataTypes.String | RenderDataTypes.HTML | RenderDataTypes.Icon ? string :
    T extends RenderDataTypes.Date ? Date :
      T extends RenderDataTypes.Number | RenderDataTypes.Decimal ? number :
        T extends RenderDataTypes.Bool ? boolean :
          T extends RenderDataTypes.Template ? null :
            T extends RenderDataTypes.Void ? undefined :
              never;
