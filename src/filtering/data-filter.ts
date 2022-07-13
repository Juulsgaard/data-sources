
class DataFilter<TFilter, TModel> {
  constructor(
    private readonly _filter: (list: TModel[], filter: TFilter) => TModel[],
    private readonly _isActive: (filter: TFilter) => boolean
  ) {

  }

  isActive(filter: TFilter) {
    return this._isActive(filter)
  }

  filter(filter: TFilter, list: TModel[]) {
    if (!this.isActive(filter)) return list;
    return this._filter(list, filter);
  }
}

class IndividualDataFilter<TFilter, TModel> extends DataFilter<TFilter, TModel> {
  constructor(
    filter: (data: TModel, filter: TFilter) => boolean,
    isActive: (filter: TFilter) => boolean
  ) {
    super((list, f) => list.filter(x => filter(x, f)), isActive);
  }
}
