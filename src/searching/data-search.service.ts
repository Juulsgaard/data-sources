import {Provider, Type} from "@angular/core";
import {SearchKey, SearchResult} from "./data-search.models";


export abstract class DataSearchService {

  public static Provide(searchService: Type<DataSearchService>): Provider {
    return {provide: DataSearchService, useClass: searchService};
  }


  abstract createSearcher<T>(items: T[], keys: SearchKey<T>[]): DataSearcher<T>;
}

export abstract class DataSearcher<T> {

  abstract populate(items: T[]): void;
  abstract search(query: string, limit?: number): SearchResult<T>[];

}

