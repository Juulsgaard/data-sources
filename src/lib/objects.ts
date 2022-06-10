import {MapFunc} from "./types";

export function deepCopy<T>(source: T): T {

  if (source === undefined) return undefined!;
  if (source === null) return null!;

  if (source instanceof Date) {
    return new Date(source.getTime()) as any;
  }

  if (Array.isArray(source)) {
    return source.map(x => deepCopy(x)) as any;
  }

  if (source instanceof Object) {
    const ret: any = {};
    for (let key in source) {
      ret[key] = deepCopy(source[key]);
    }
    return ret;
  }

  return source;
}

export function arrToObj<T, TVal>(array: T[], getKey: MapFunc<T, string>, getVal: MapFunc<T, TVal>): Record<string, TVal> {
  const obj = {} as Record<string, TVal>;
  for (let item of array) {
    obj[getKey(item)] = getVal(item);
  }
  return obj;
}
