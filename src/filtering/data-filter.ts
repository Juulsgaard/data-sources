export class DataFilter<TFilter, TModel> {
  constructor(
    private readonly _filter: <T extends TModel>(list: T[], filter: TFilter) => T[],
    private readonly _isActive: (filter: TFilter) => boolean
  ) {

  }

  isActive(filter: TFilter) {
    return this._isActive(filter)
  }

  filter<T extends TModel>(filter: TFilter, list: T[]): T[] {
    if (!this.isActive(filter)) return list;
    return this._filter(list, filter);
  }
}

export class IndividualDataFilter<TFilter, TModel> extends DataFilter<TFilter, TModel> {
  constructor(
    filter: (data: TModel, filter: TFilter) => boolean,
    isActive: (filter: TFilter) => boolean
  ) {
    super((list, f) => list.filter(x => filter(x, f)), isActive);
  }
}
