import * as Vitest from 'vitest';

import * as Constructor from '../index.js';

Vitest.describe('[runtime] Constructor.isConstructor', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Constructor.isConstructor).toBeDefined();
  });

  Vitest.it('should return true for class constructors', () => {
    class TestClass {}
    Vitest.expect(Constructor.isConstructor(TestClass)).toBe(true);
  });

  Vitest.it('should return true for function constructors with proper prototype', () => {
    function TestFunction() {}
    Vitest.expect(Constructor.isConstructor(TestFunction)).toBe(true);
  });

  Vitest.it('should return true for built-in constructors', () => {
    Vitest.expect(Constructor.isConstructor(Array)).toBe(true);
    Vitest.expect(Constructor.isConstructor(Object)).toBe(true);
    Vitest.expect(Constructor.isConstructor(String)).toBe(true);
    Vitest.expect(Constructor.isConstructor(Number)).toBe(true);
    Vitest.expect(Constructor.isConstructor(Boolean)).toBe(true);
    Vitest.expect(Constructor.isConstructor(Date)).toBe(true);
    Vitest.expect(Constructor.isConstructor(RegExp)).toBe(true);
    Vitest.expect(Constructor.isConstructor(Error)).toBe(true);
  });

  Vitest.it('should return false for arrow functions', () => {
    const arrowFunction = () => {};
    Vitest.expect(Constructor.isConstructor(arrowFunction)).toBe(false);
  });

  Vitest.it('should return false for callable objects without proper prototype', () => {
    // Create a callable object that doesn't have proper prototype structure
    const callableObject = Object.assign(() => {}, {
      prototype: undefined,
    });
    Vitest.expect(Constructor.isConstructor(callableObject)).toBe(false);
  });

  Vitest.it('should return false for functions with prototype but wrong constructor', () => {
    const fn = function () {};
    fn.prototype = { constructor: function () {} };
    Vitest.expect(Constructor.isConstructor(fn)).toBe(false);
  });

  Vitest.it('should return false for non-callable values', () => {
    Vitest.expect(Constructor.isConstructor(null)).toBe(false);
    Vitest.expect(Constructor.isConstructor(undefined)).toBe(false);
    Vitest.expect(Constructor.isConstructor(123)).toBe(false);
    Vitest.expect(Constructor.isConstructor('string')).toBe(false);
    Vitest.expect(Constructor.isConstructor(true)).toBe(false);
    Vitest.expect(Constructor.isConstructor({})).toBe(false);
    Vitest.expect(Constructor.isConstructor([])).toBe(false);
    Vitest.expect(Constructor.isConstructor(Symbol('test'))).toBe(false);
  });

  Vitest.it('should return false for async functions', () => {
    const asyncFunction = async function () {};
    Vitest.expect(Constructor.isConstructor(asyncFunction)).toBe(false);
  });

  Vitest.it('should return false for generator functions', () => {
    function* generatorFunction() {}
    Vitest.expect(Constructor.isConstructor(generatorFunction)).toBe(false);
  });

  Vitest.it('should return false for async generator functions', () => {
    async function* asyncGeneratorFunction() {}
    Vitest.expect(Constructor.isConstructor(asyncGeneratorFunction)).toBe(false);
  });

  Vitest.it('should return false for bound functions', () => {
    function TestFunction() {}
    const boundFunction = TestFunction.bind(null);
    Vitest.expect(Constructor.isConstructor(boundFunction)).toBe(false);
  });

  Vitest.it('should return false for methods', () => {
    const obj = {
      method() {},
    };
    Vitest.expect(Constructor.isConstructor(obj.method)).toBe(false);
  });

  Vitest.it('should return false for functions with null prototype', () => {
    const fn = function () {};
    fn.prototype = null;
    Vitest.expect(Constructor.isConstructor(fn)).toBe(false);
  });

  Vitest.it('should work with custom constructor functions', () => {
    function CustomConstructor(value) {
      this.value = value;
    }
    CustomConstructor.prototype.getValue = function () {
      return this.value;
    };

    Vitest.expect(Constructor.isConstructor(CustomConstructor)).toBe(true);
  });

  Vitest.it('should work with ES6 classes with inheritance', () => {
    class BaseClass {}
    class DerivedClass extends BaseClass {}

    Vitest.expect(Constructor.isConstructor(BaseClass)).toBe(true);
    Vitest.expect(Constructor.isConstructor(DerivedClass)).toBe(true);
  });
});

Vitest.describe('[types] Constructor.isConstructor', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Constructor.isConstructor;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should narrow type to Constructor when used as type guard', () => {
    const value: unknown = class TestClass {};

    if (Constructor.isConstructor(value)) {
      Vitest.expectTypeOf(value).toEqualTypeOf<
        Constructor.Constructor<unknown, readonly unknown[]>
      >();
    }
  });

  Vitest.it('should work with specific constructor types', () => {
    class TestClass {
      constructor(public value: string) {}
    }

    const value: unknown = TestClass;

    if (Constructor.isConstructor<TestClass, [string]>(value)) {
      Vitest.expectTypeOf(value).toEqualTypeOf<Constructor.Constructor<TestClass, [string]>>();
    }
  });

  Vitest.it('should preserve constructor type when passed known constructor', () => {
    class TestClass {}
    const ctor: Constructor.Constructor<TestClass, []> = TestClass;

    if (Constructor.isConstructor(ctor)) {
      Vitest.expectTypeOf(ctor).toEqualTypeOf<Constructor.Constructor<TestClass, []>>();
    }
  });
});
