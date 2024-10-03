import {SearchKey, SearchResult} from "./data-search.models";
import {isObject, sortNumAsc} from "@juulsgaard/ts-tools";
import {DataSearcher, DataSearchService} from "./data-search.service";

export class SimpleSearchService extends DataSearchService {

  override createSearcher<T>(items: T[], keys: SearchKey<T>[]): DataSearcher<T> {
    return new SimpleSearcher(items, keys);
  }
}

export class SimpleSearcher<T> extends DataSearcher<T> {

  private index: SimpleIndex<T>[] = [];

  constructor(items: T[], private readonly keys: SearchKey<T>[]) {
    super();

    this.populate(items);
  }

  override populate(items: T[]): void {
    this.index = items.map((value): SimpleIndex<T> => (
      {
        value,
        indices: this.keys.map(key => {
          if ('path' in key) {
            return {
              weight: key.weight ?? 1,
              str: String(valueFromPath(value, key.path) ?? '')
            };
          }

          return {
            weight: key.weight ?? 1,
            str: key.getValue(value)
          };
        })
      }
    ))
  }

  override search(query: string | undefined, limit: number): SearchResult<T>[] {
    query = query?.trim();
    if (!query?.length) {
      return this.index.map(({value}, i) => (
        {value, score: i}
      )).slice(0, limit);
    }

    const result = this.index.map(({value, indices}) => {
      let score = 0;
      for (let {str, weight} of indices) {
        if (str.startsWith(query)) {
          score += weight;
        } else if (str.includes(query)) score += weight * 0.8;
      }
      return {value, score: -score};
    });

    return result.sort(sortNumAsc(x => x.score)).slice(0, limit);
  }
}

interface SimpleIndex<T> {
  value: T;
  indices: { str: string, weight: number }[];
}

function valueFromPath(value: unknown, path: string[]): unknown | undefined {
  for (let key of path) {
    if (!isObject(value)) return undefined;
    if (!value.hasOwnProperty(key)) return undefined;
    value = (
      value as Record<string, unknown>
    )[key];
  }

  return value;
}
