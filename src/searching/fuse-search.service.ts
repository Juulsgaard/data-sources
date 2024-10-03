import {DataSearcher, DataSearchService} from "./data-search.service";
import {SearchKey, SearchResult} from "./data-search.models";
import Fuse from "fuse.js";

export class FuseSearchService extends DataSearchService {

  override createSearcher<T>(items: T[], keys: SearchKey<T>[]): DataSearcher<T> {
    return new FuseSearcher(items, keys);
  }
}

export class FuseSearcher<T> extends DataSearcher<T> {

  private collection: T[];
  private readonly searcher: Fuse<T>;

  constructor(items: T[], keys: SearchKey<T>[]) {
    super();

    this.collection = items;
    this.searcher = new Fuse<T>(items, {
      includeScore: true,
      shouldSort: true,
      keys: keys.map((key) => (
        {
          getFn: 'getValue' in key ? key.getValue : undefined,
          name: 'path' in key ? key.path : key.name,
          weight: key.weight ?? 1
        }
      ))
    });
  }

  override populate(items: T[]): void {
    this.collection = items;
    this.searcher.setCollection(items);
  }

  override search(query: string|undefined, limit: number): SearchResult<T>[] {
    if (!query?.length) return this.collection.map((value, i) => ({value, score: i})).slice(0, limit);

    return this.searcher.search(query ?? '', {limit}).map(({item, score}, i) => ({value: item, score: score ?? i}));
  }
}
