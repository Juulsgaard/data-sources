import {assertInInjectionContext, DestroyRef, effect, inject, Injector, signal, Signal} from "@angular/core";

// TODO: Move to @Juulsgaard/signal-tools package

/**
 * Create a signal where values are only emitted after the values have settled for `delay` ms
 * @param inputSignal - The input value to debounce
 * @param delay - The required delay between values
 * @param options - Additional options
 */
export function debouncedSignal<T>(
  inputSignal: Signal<T>,
  delay = 500,
  options?: { injector?: Injector }
): Signal<T> {

  if (options?.injector) assertInInjectionContext(debouncedSignal);

  const output = signal(inputSignal());

  effect(onDestroy => {
    const value = inputSignal();
    const timeout = setTimeout(() => output.set(value), delay);
    onDestroy(() => clearTimeout(timeout));
  }, {allowSignalWrites: true, injector: options?.injector});

  return output;
}

/**
 * Create a signal where values are throttled
 * @param inputSignal - The input value to throttle
 * @param delay - The delay between values
 * @param options - Additional options
 */
export function throttleSignal<T>(
  inputSignal: Signal<T>,
  delay = 500,
  options?: { injector?: Injector, emitLeading?: boolean }
): Signal<T> {

  if (options?.injector) assertInInjectionContext(throttleSignal);

  const output = signal(inputSignal());

  let nextValue: T = inputSignal();
  let timeout: number | undefined = undefined;

  effect(() => {
    const value = inputSignal();
    nextValue = value;

    if (timeout) return;

    if (options?.emitLeading) {
      output.set(value);
    }

    timeout = setTimeout(() => {
      output.set(nextValue);
      timeout = undefined;
    }, delay);

  }, {allowSignalWrites: true, injector: options?.injector});

  const onDestroy = options?.injector?.get(DestroyRef) ?? inject(DestroyRef);
  onDestroy.onDestroy(() => clearTimeout(timeout));

  return output;
}

/**
 * Create a signal where values are throttled and debounced, but where empty strings skip the delay
 * @param inputSignal - The input value to throttle
 * @param throttleDelay - The delay between value emissions during continual input
 * @param debounceDelay - The amount of time the input needs to settle before a value is emitted
 * @param options - Additional options
 */
export function searchSignal<T extends string | undefined>(
  inputSignal: Signal<T>,
  throttleDelay = 1000,
  debounceDelay = 300,
  options?: { injector?: Injector }
): Signal<T> {

  if (options?.injector) assertInInjectionContext(searchSignal);

  const query = signal(inputSignal());

  let nextValue: T = inputSignal();
  let longTimeout: number | undefined = undefined;

  function clearThrottle() {
    if (!longTimeout) return;
    clearTimeout(longTimeout);
    longTimeout = undefined;
  }

  effect(onDestroy => {
    const value = inputSignal();


    // If the new value is empty, skip delay
    if (value === undefined || value === '') {
      query.set(value);
      clearThrottle();
      return;
    }

    // Set a shorter debounce timout
    const shortTimeout = setTimeout(() => {
      query.set(value);
      clearThrottle();
    }, debounceDelay);

    onDestroy(() => clearTimeout(shortTimeout));


    // Update the pending value for the longer throttle timeout
    nextValue = value;

    if (longTimeout) return;


    // If no throttle timeout exists, schedule one
    longTimeout = setTimeout(() => {
      query.set(nextValue);
      longTimeout = undefined;
    }, throttleDelay);

  }, {allowSignalWrites: true, injector: options?.injector});

  const onDestroy = options?.injector?.get(DestroyRef) ?? inject(DestroyRef);
  onDestroy.onDestroy(() => clearTimeout(longTimeout));

  return query;
}
