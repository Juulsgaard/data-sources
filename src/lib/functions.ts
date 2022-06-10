import {Selection} from "./types";

export function applySelector<TModel, TProp>(data: TModel, selector: Selection<TModel, TProp>): TProp {
  return selector instanceof Function ? selector(data) as TProp : data[selector] as unknown as TProp;
}

export function getSelectorFn<TModel, TProp>(selector: Selection<TModel, TProp>): (model: TModel) => TProp {
  return selector instanceof Function
    ? selector
    : data => data[selector] as unknown as TProp;
}
