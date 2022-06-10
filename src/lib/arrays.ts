
export function mapArr<TIn, TOut>(array: TIn[], map: (x: TIn) => TOut|undefined|null): TOut[] {
  const output: TOut[] = [];
  for (const key in array) {
    if (!array.hasOwnProperty(key)) continue;
    const val = map(array[key]);
    if (val != null) output.push(val);
  }
  return output;
}

export function mapToArr<TKey, TVal, TOut>(map: Map<TKey, TVal>, fn: (key: TKey, val: TVal) => TOut) {
  const output: TOut[] = [];
  for (let [key, val] of map) {
    output.push(fn(key, val));
  }

  return output;
}
