import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[runtime] Function.isCallable', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Function.isCallable).toBeDefined();
  });

  Vitest.it('should return true for an anonymous function', () => {
    Vitest.expect(Function.isCallable(() => {})).toBe(true);
  });

  Vitest.it('should return false for a non-function', () => {
    Vitest.expect(Function.isCallable(1)).toBe(false);
  });

  Vitest.it('should return true for a function expression', () => {
    const fn = function () {};
    Vitest.expect(Function.isCallable(fn)).toBe(true);
  });

  Vitest.it('should return true for an arrow function', () => {
    const fn = () => {};
    Vitest.expect(Function.isCallable(fn)).toBe(true);
  });

  Vitest.it('should return false for a promise', () => {
    const promise = new Promise((resolve) => resolve(true));

    Vitest.expect(Function.isCallable(promise)).toBe(false);
  });

  Vitest.it('should return true for function that returns a promise', () => {
    const promise = () => new Promise((resolve) => resolve(true));

    Vitest.expect(Function.isCallable(promise)).toBe(true);
  });
});

Vitest.describe('[types] Function.isCallable', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Function.isCallable;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
