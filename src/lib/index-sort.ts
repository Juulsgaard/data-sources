
export interface ISorted {
  index: number;
}

export function sortByIndexAsc(a: ISorted, b: ISorted) {
  return (a?.index ?? 0) - (a?.index ?? 0);
}
