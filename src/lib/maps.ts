import {MapFunc} from "./types";


export function arrToMap<T, TKey, TVal>(array: T[], getKey: MapFunc<T, TKey>, getVal: MapFunc<T, TVal>): Map<TKey, TVal> {
  const map = new Map<TKey, TVal>();
  for (let item of array) {
    map.set(getKey(item), getVal(item));
  }
  return map;
}

export function arrToLookup<T, TKey, TVal>(array: T[], getKey: MapFunc<T, TKey>, getVal: MapFunc<T, TVal>): Map<TKey extends undefined ? null : TKey, TVal[]> {
  const map = new Map<TKey, TVal[]>();

  for (let item of array) {
    const key = getKey(item);
    const val = getVal(item);
    const list = map.get(key);

    if (!list) {
      map.set(key, [val]);
      continue;
    }

    list.push(val);
  }

  return map as Map<TKey extends undefined ? null : TKey, TVal[]>;
}
