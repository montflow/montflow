import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.once', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.once).toBeDefined();
  });

  Vitest.describe('with nullary functions', () => {
    Vitest.it('should execute function only once', () => {
      let executionCount = 0;

      const expensiveOperation = () => {
        executionCount++;
        return 'result';
      };

      const _operation = Macro.once('nullary-once', expensiveOperation);

      Vitest.expect(executionCount).toBe(0);

      const result1 = _operation();
      Vitest.expect(executionCount).toBe(1);
      Vitest.expect(result1).toBe('result');

      const result2 = _operation();
      Vitest.expect(executionCount).toBe(1);
      Vitest.expect(result2).toBe('result');

      const result3 = _operation();
      Vitest.expect(executionCount).toBe(1);
      Vitest.expect(result3).toBe('result');
    });

    Vitest.it('should cache and return the same result', () => {
      const generateId = () => Math.random();

      const getId = Macro.once('nullary-cache', generateId);

      const id1 = getId();
      const id2 = getId();
      const id3 = getId();

      Vitest.expect(id1).toBe(id2);
      Vitest.expect(id2).toBe(id3);
    });

    Vitest.it('should handle void return type', () => {
      let sideEffect = 0;

      const doSomething = () => {
        sideEffect++;
      };

      const _operation = Macro.once('nullary-void', doSomething);

      _operation();
      Vitest.expect(sideEffect).toBe(1);

      _operation();
      Vitest.expect(sideEffect).toBe(1);

      _operation();
      Vitest.expect(sideEffect).toBe(1);
    });
  });

  Vitest.describe('with functions with arguments', () => {
    Vitest.it('should execute function only once with provided arguments', () => {
      let executionCount = 0;

      const expensiveOperation = (a: number, b: string, c: boolean) => {
        executionCount++;
        return { a, b, c };
      };

      const operation = Macro.once('with-args-once', expensiveOperation, 42, 'test', true);

      Vitest.expect(executionCount).toBe(0);

      const result1 = operation();
      Vitest.expect(executionCount).toBe(1);
      Vitest.expect(result1).toEqual({ a: 42, b: 'test', c: true });

      const result2 = operation();
      Vitest.expect(executionCount).toBe(1);
      Vitest.expect(result2).toEqual({ a: 42, b: 'test', c: true });

      const result3 = operation();
      Vitest.expect(executionCount).toBe(1);
      Vitest.expect(result3).toEqual({ a: 42, b: 'test', c: true });
    });

    Vitest.it('should bind arguments at creation time', () => {
      const concat = (a: string, b: string, c: string) => a + b + c;

      const operation = Macro.once('bind-args', concat, 'hello', ' ', 'world');

      const result = operation();

      Vitest.expect(result).toBe('hello world');
    });

    Vitest.it('should cache result with bound arguments', () => {
      let callCount = 0;

      const compute = (x: number, y: number) => {
        callCount++;
        return x * y + Math.random();
      };

      const computation = Macro.once('cache-with-args', compute, 10, 5);

      const result1 = computation();
      const result2 = computation();
      const result3 = computation();

      Vitest.expect(callCount).toBe(1);
      Vitest.expect(result1).toBe(result2);
      Vitest.expect(result2).toBe(result3);
    });

    Vitest.it('should handle complex argument types', () => {
      type Config = { host: string; port: number };
      type Options = { timeout: number; retries: number };

      let callCount = 0;

      const createConnection = (config: Config, options: Options) => {
        callCount++;
        return { ...config, ...options, connected: true };
      };

      const config: Config = { host: 'localhost', port: 3000 };
      const options: Options = { timeout: 5000, retries: 3 };

      const getConnection = Macro.once('complex-args', createConnection, config, options);

      const conn1 = getConnection();
      Vitest.expect(callCount).toBe(1);
      Vitest.expect(conn1).toEqual({
        host: 'localhost',
        port: 3000,
        timeout: 5000,
        retries: 3,
        connected: true,
      });

      const conn2 = getConnection();
      Vitest.expect(callCount).toBe(1);
      Vitest.expect(conn2).toBe(conn1);
    });
  });

  Vitest.describe('error handling', () => {
    Vitest.it('should throw OnceAlreadyExistsError when registering duplicate id', () => {
      const fn1 = () => 'result1';
      const fn2 = () => 'result2';

      Macro.once('duplicate-once-id', fn1);

      Vitest.expect(() => {
        Macro.once('duplicate-once-id', fn2);
      }).toThrow(Macro.OnceAlreadyExistsError);
    });

    Vitest.it('should throw with correct error message', () => {
      const fn1 = () => 'result';
      const fn2 = () => 'result';

      Macro.once('duplicate-once-msg', fn1);

      try {
        Macro.once('duplicate-once-msg', fn2);
        Vitest.expect.fail('Should have thrown');
      } catch (error) {
        Vitest.expect(error).toBeInstanceOf(Macro.OnceAlreadyExistsError);
        // SAFETY: the caught error was asserted to be a OnceAlreadyExistsError above.
        Vitest.expect((error as Error).message).toContain('duplicate-once-msg');
      }
    });
  });

  Vitest.describe('lazy execution', () => {
    Vitest.it('should not execute until called', () => {
      let executed = false;

      const fn = () => {
        executed = true;
        return 'result';
      };

      Macro.once('lazy-once', fn);

      Vitest.expect(executed).toBe(false);
    });

    Vitest.it('should execute on first call', () => {
      let executed = false;

      const fn = () => {
        executed = true;
        return 'result';
      };

      const operation = Macro.once('lazy-once-2', fn);

      Vitest.expect(executed).toBe(false);

      operation();

      Vitest.expect(executed).toBe(true);
    });

    Vitest.it('should not execute until called even with arguments', () => {
      let executed = false;

      const fn = (x: number) => {
        executed = true;
        return x * 2;
      };

      Macro.once('lazy-once-args', fn, 42);

      Vitest.expect(executed).toBe(false);
    });
  });

  Vitest.describe('side effects', () => {
    Vitest.it('should only perform side effects once', () => {
      const log: string[] = [];

      const operation = () => {
        log.push('executed');
      };

      const op = Macro.once('side-effects', operation);

      op();
      Vitest.expect(log).toEqual(['executed']);

      op();
      Vitest.expect(log).toEqual(['executed']);

      op();
      Vitest.expect(log).toEqual(['executed']);
    });

    Vitest.it('should preserve mutations on returned objects', () => {
      const createState = () => ({ count: 0 });

      const getState = Macro.once('mutable-state', createState);

      const state1 = getState();
      state1.count = 10;

      const state2 = getState();
      Vitest.expect(state2.count).toBe(10);
      Vitest.expect(state2).toBe(state1);
    });
  });
});

Vitest.describe('[types] Macro.once', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.once;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should correctly type nullary function', () => {
    const fn = () => 42;

    const _operation = Macro.once('type-nullary', fn);

    type OperationType = typeof _operation;
    type Result = ReturnType<OperationType>;

    Vitest.expectTypeOf<OperationType>().toEqualTypeOf<() => number>();
    Vitest.expectTypeOf<Result>().toEqualTypeOf<number>();
  });

  Vitest.it('should correctly type function with arguments', () => {
    const fn = (a: number, b: string) => ({ a, b });

    const _operation = Macro.once('type-with-args', fn, 42, 'test');

    type OperationType = typeof _operation;
    type Result = ReturnType<OperationType>;

    Vitest.expectTypeOf<OperationType>().toEqualTypeOf<() => { a: number; b: string }>();
    Vitest.expectTypeOf<Result>().toEqualTypeOf<{ a: number; b: string }>();
  });

  Vitest.it('should correctly type void return', () => {
    const fn = () => {
      /* void */
    };

    const _operation = Macro.once('type-void', fn);

    type OperationType = typeof _operation;

    Vitest.expectTypeOf<OperationType>().toEqualTypeOf<() => void>();
  });
});
