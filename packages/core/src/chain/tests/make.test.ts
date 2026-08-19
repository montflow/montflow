import * as Vitest from 'vitest';

import * as Chain from '../index.js';

Vitest.describe('[runtime] Chain.make', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Chain.make).toBeDefined();
  });

  Vitest.it('should handle single input value', () => {
    const result = Chain.make(42);
    Vitest.expect(result).toBe(42);
  });

  Vitest.it('should handle single input nullary function', () => {
    const getValue = () => 'hello';
    const result = Chain.make(getValue);
    Vitest.expect(result).toBe('hello');
  });

  Vitest.it('should handle input with one transformation operator', () => {
    const double = (x: number) => x * 2;
    const result = Chain.make(5, double);
    Vitest.expect(result).toBe(10);
  });

  Vitest.it('should handle nullary input with one transformation operator', () => {
    const getValue = () => 3;
    const triple = (x: number) => x * 3;
    const result = Chain.make(getValue, triple);
    Vitest.expect(result).toBe(9);
  });

  Vitest.it('should handle input with two transformation operators', () => {
    const double = (x: number) => x * 2;
    const toString = (x: number) => x.toString();
    const result = Chain.make(5, double, toString);
    Vitest.expect(result).toBe('10');
  });

  Vitest.it('should handle input with three transformation operators', () => {
    const double = (x: number) => x * 2;
    const toString = (x: number) => x.toString();
    const addExclamation = (x: string) => x + '!';
    const result = Chain.make(5, double, toString, addExclamation);
    Vitest.expect(result).toBe('10!');
  });

  Vitest.it('should handle input with four transformation operators', () => {
    const double = (x: number) => x * 2;
    const toString = (x: number) => x.toString();
    const addExclamation = (x: string) => x + '!';
    const toUpperCase = (x: string) => x.toUpperCase();
    const result = Chain.make(5, double, toString, addExclamation, toUpperCase);
    Vitest.expect(result).toBe('10!');
  });

  Vitest.it('should handle complex type transformations', () => {
    const numbers = [1, 2, 3];
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const isEven = (n: number) => n % 2 === 0;
    const result = Chain.make(numbers, sum, isEven);
    Vitest.expect(result).toBe(true); // 1+2+3=6, which is even
  });

  Vitest.it('should handle object transformations', () => {
    const person = { name: 'John', age: 30 };
    const getName = (p: { name: string; age: number }) => p.name;
    const toUpperCase = (s: string) => s.toUpperCase();
    const addGreeting = (s: string) => `Hello, ${s}!`;
    const result = Chain.make(person, getName, toUpperCase, addGreeting);
    Vitest.expect(result).toBe('Hello, JOHN!');
  });

  Vitest.it('should handle array transformations', () => {
    const words = ['hello', 'world'];
    const join = (arr: string[]) => arr.join(' ');
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const result = Chain.make(words, join, capitalize);
    Vitest.expect(result).toBe('Hello world');
  });

  Vitest.it('should handle longer chains with mixed types', () => {
    const input = '123';
    const parseNumber = (s: string) => parseInt(s, 10);
    const square = (n: number) => n * n;
    const toString = (n: number) => n.toString();
    const addPrefix = (s: string) => `Result: ${s}`;
    const getLength = (s: string) => s.length;
    const isGreaterThan10 = (n: number) => n > 10;

    const result = Chain.make(
      input,
      parseNumber,
      square,
      toString,
      addPrefix,
      getLength,
      isGreaterThan10,
    );

    // "123" -> 123 -> 15129 -> "15129" -> "Result: 15129" -> 14 -> true
    Vitest.expect(result).toBe(true);
  });

  Vitest.it('should handle maximum chain length', () => {
    const input = 1;
    const increment = (n: number) => n + 1;

    // Test with 16 operators (maximum supported)
    const result = Chain.make(
      input,
      increment, // 2
      increment, // 3
      increment, // 4
      increment, // 5
      increment, // 6
      increment, // 7
      increment, // 8
      increment, // 9
      increment, // 10
      increment, // 11
      increment, // 12
      increment, // 13
      increment, // 14
      increment, // 15
      increment, // 16
      increment, // 17
    );

    Vitest.expect(result).toBe(17);
  });

  Vitest.it('should handle 13 operators', () => {
    const input = 0;
    const increment = (n: number) => n + 1;

    const result = Chain.make(
      input,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
    );

    Vitest.expect(result).toBe(13);
  });

  Vitest.it('should handle 14 operators', () => {
    const input = 0;
    const increment = (n: number) => n + 1;

    const result = Chain.make(
      input,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
    );

    Vitest.expect(result).toBe(14);
  });

  Vitest.it('should handle 15 operators', () => {
    const input = 0;
    const increment = (n: number) => n + 1;

    const result = Chain.make(
      input,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
    );

    Vitest.expect(result).toBe(15);
  });

  Vitest.it('should handle 16 operators', () => {
    const input = 0;
    const increment = (n: number) => n + 1;

    const result = Chain.make(
      input,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
    );

    Vitest.expect(result).toBe(16);
  });

  Vitest.it('should handle complex type chain with 13 operators', () => {
    const input = '3';
    const parseNumber = (s: string) => parseInt(s, 10);
    const double = (n: number) => n * 2;
    const toString = (n: number) => n.toString();
    const addPrefix = (s: string) => `num: ${s}`;
    const getLength = (s: string) => s.length;
    const isOdd = (n: number) => n % 2 === 1;
    const boolToString = (b: boolean) => b.toString();
    const toUpperCase = (s: string) => s.toUpperCase();
    const split = (s: string) => s.split('');
    const join = (arr: string[]) => arr.join('-');
    const addSuffix = (s: string) => `${s}!`;
    const trim = (s: string) => s.trim();
    const reverse = (s: string) => s.split('').reverse().join('');

    const result = Chain.make(
      input,
      parseNumber, // 3
      double, // 6
      toString, // "6"
      addPrefix, // "num: 6"
      getLength, // 6
      isOdd, // false
      boolToString, // "false"
      toUpperCase, // "FALSE"
      split, // ["F", "A", "L", "S", "E"]
      join, // "F-A-L-S-E"
      addSuffix, // "F-A-L-S-E!"
      trim, // "F-A-L-S-E!"
      reverse, // "!E-S-L-A-F"
    );

    Vitest.expect(result).toBe('!E-S-L-A-F');
  });
});

Vitest.describe('[types] Chain.make', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Chain.make;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should infer correct return type for single input', () => {
    const result = Chain.make(42);
    Vitest.expectTypeOf(result).toEqualTypeOf<number>();
  });

  Vitest.it('should infer correct return type for nullary input', () => {
    const getValue = (): string => 'hello';
    const result = Chain.make(getValue);
    Vitest.expectTypeOf(result).toEqualTypeOf<string>();
  });

  Vitest.it('should infer correct return type for one transformation', () => {
    const toString = (n: number): string => n.toString();
    const result = Chain.make(42, toString);
    Vitest.expectTypeOf(result).toEqualTypeOf<string>();
  });

  Vitest.it('should infer correct return type for two transformations', () => {
    const toString = (n: number): string => n.toString();
    const getLength = (s: string): number => s.length;
    const result = Chain.make(42, toString, getLength);
    Vitest.expectTypeOf(result).toEqualTypeOf<number>();
  });

  Vitest.it('should infer correct return type for three transformations', () => {
    const toString = (n: number): string => n.toString();
    const getLength = (s: string): number => s.length;
    const isEven = (n: number): boolean => n % 2 === 0;
    const result = Chain.make(42, toString, getLength, isEven);
    Vitest.expectTypeOf(result).toEqualTypeOf<boolean>();
  });

  Vitest.it('should infer correct return type for complex type chain', () => {
    const numbers: number[] = [1, 2, 3];
    const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);
    const toString = (n: number): string => n.toString();
    const split = (s: string): string[] => s.split('');
    const result = Chain.make(numbers, sum, toString, split);
    Vitest.expectTypeOf(result).toEqualTypeOf<string[]>();
  });

  Vitest.it('should handle generic type parameters correctly', () => {
    interface Person {
      name: string;
      age: number;
    }

    const person: Person = { name: 'John', age: 30 };
    const getName = (p: Person): string => p.name;
    const toUpperCase = (s: string): string => s.toUpperCase();
    const result = Chain.make(person, getName, toUpperCase);

    Vitest.expectTypeOf(result).toEqualTypeOf<string>();
  });

  Vitest.it('should handle union types correctly', () => {
    const input: string | number = '42';
    const toString = (x: string | number): string => x.toString();
    const getLength = (s: string): number => s.length;
    const result = Chain.make(input, toString, getLength);

    Vitest.expectTypeOf(result).toEqualTypeOf<number>();
  });

  Vitest.it('should handle optional parameters in operators', () => {
    const input = 'hello';
    const padStart = (s: string): string => s.padStart(10, '0');
    const result = Chain.make(input, padStart);

    Vitest.expectTypeOf(result).toEqualTypeOf<string>();
  });

  Vitest.it('should handle maximum chain length types', () => {
    const input = 1;
    const increment = (n: number): number => n + 1;

    const result = Chain.make(
      input,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
      increment,
    );

    Vitest.expectTypeOf(result).toEqualTypeOf<number>();
  });

  Vitest.it('should infer correct return type for 13 operators', () => {
    const input = 'test';
    const getLength = (s: string): number => s.length;
    const double = (n: number): number => n * 2;
    const toString = (n: number): string => n.toString();
    const toUpperCase = (s: string): string => s.toUpperCase();
    const split = (s: string): string[] => s.split('');
    const join = (arr: string[]): string => arr.join('-');
    const trim = (s: string): string => s.trim();
    const addPrefix = (s: string): string => `prefix-${s}`;
    const getLen = (s: string): number => s.length;
    const isEven = (n: number): boolean => n % 2 === 0;
    const boolToString = (b: boolean): string => b.toString();
    const reverse = (s: string): string => s.split('').reverse().join('');
    const finalTransform = (s: string): number => s.length;

    const result = Chain.make(
      input,
      getLength,
      double,
      toString,
      toUpperCase,
      split,
      join,
      trim,
      addPrefix,
      getLen,
      isEven,
      boolToString,
      reverse,
      finalTransform,
    );

    Vitest.expectTypeOf(result).toEqualTypeOf<number>();
  });

  Vitest.it('should infer correct return type for 14 operators', () => {
    const input = 42;
    const toString = (n: number): string => n.toString();
    const getLength = (s: string): number => s.length;
    const double = (n: number): number => n * 2;
    const toStr = (n: number): string => n.toString();
    const toUpper = (s: string): string => s.toUpperCase();
    const split = (s: string): string[] => s.split('');
    const join = (arr: string[]): string => arr.join('-');
    const trim = (s: string): string => s.trim();
    const addPrefix = (s: string): string => `prefix-${s}`;
    const getLen = (s: string): number => s.length;
    const isEven = (n: number): boolean => n % 2 === 0;
    const boolToString = (b: boolean): string => b.toString();
    const reverse = (s: string): string => s.split('').reverse().join('');
    const finalTransform = (s: string): boolean => s.includes('x');

    const result = Chain.make(
      input,
      toString,
      getLength,
      double,
      toStr,
      toUpper,
      split,
      join,
      trim,
      addPrefix,
      getLen,
      isEven,
      boolToString,
      reverse,
      finalTransform,
    );

    Vitest.expectTypeOf(result).toEqualTypeOf<boolean>();
  });

  Vitest.it('should infer correct return type for 15 operators', () => {
    const input = [1, 2, 3];
    const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);
    const toString = (n: number): string => n.toString();
    const getLength = (s: string): number => s.length;
    const double = (n: number): number => n * 2;
    const toStr = (n: number): string => n.toString();
    const toUpper = (s: string): string => s.toUpperCase();
    const split = (s: string): string[] => s.split('');
    const join = (arr: string[]): string => arr.join('-');
    const trim = (s: string): string => s.trim();
    const addPrefix = (s: string): string => `prefix-${s}`;
    const getLen = (s: string): number => s.length;
    const isEven = (n: number): boolean => n % 2 === 0;
    const boolToString = (b: boolean): string => b.toString();
    const reverse = (s: string): string => s.split('').reverse().join('');
    const finalTransform = (s: string): string[] => s.split('-');

    const result = Chain.make(
      input,
      sum,
      toString,
      getLength,
      double,
      toStr,
      toUpper,
      split,
      join,
      trim,
      addPrefix,
      getLen,
      isEven,
      boolToString,
      reverse,
      finalTransform,
    );

    Vitest.expectTypeOf(result).toEqualTypeOf<string[]>();
  });

  Vitest.it('should infer correct return type for 16 operators', () => {
    const input = { value: 10 };
    const getValue = (obj: { value: number }): number => obj.value;
    const toString = (n: number): string => n.toString();
    const getLength = (s: string): number => s.length;
    const double = (n: number): number => n * 2;
    const toStr = (n: number): string => n.toString();
    const toUpper = (s: string): string => s.toUpperCase();
    const split = (s: string): string[] => s.split('');
    const join = (arr: string[]): string => arr.join('-');
    const trim = (s: string): string => s.trim();
    const addPrefix = (s: string): string => `prefix-${s}`;
    const getLen = (s: string): number => s.length;
    const isEven = (n: number): boolean => n % 2 === 0;
    const boolToString = (b: boolean): string => b.toString();
    const reverse = (s: string): string => s.split('').reverse().join('');
    const splitAgain = (s: string): string[] => s.split('-');
    const finalTransform = (arr: string[]): number => arr.length;

    const result = Chain.make(
      input,
      getValue,
      toString,
      getLength,
      double,
      toStr,
      toUpper,
      split,
      join,
      trim,
      addPrefix,
      getLen,
      isEven,
      boolToString,
      reverse,
      splitAgain,
      finalTransform,
    );

    Vitest.expectTypeOf(result).toEqualTypeOf<number>();
  });
});
