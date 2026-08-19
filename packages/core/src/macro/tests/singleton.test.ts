import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.singleton', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.singleton).toBeDefined();
  });

  Vitest.describe('with constructor', () => {
    Vitest.it('should create a singleton from a constructor with no arguments', () => {
      class Counter {
        value = 0;
        increment() {
          this.value++;
        }
      }

      const getCounter = Macro.singleton('counter-no-args', Counter);

      const instance1 = getCounter();
      const instance2 = getCounter();

      Vitest.expect(instance1).toBe(instance2);
      Vitest.expect(instance1).toBeInstanceOf(Counter);
      Vitest.expect(instance1.value).toBe(0);

      instance1.increment();

      Vitest.expect(instance1.value).toBe(1);
      Vitest.expect(instance2.value).toBe(1);
    });

    Vitest.it('should create a singleton from a constructor with arguments', () => {
      class Config {
        constructor(
          public name: string,
          public port: number,
        ) {}
      }

      const getConfig = Macro.singleton('config-with-args', Config, 'app', 3000);

      const instance1 = getConfig();
      const instance2 = getConfig();

      Vitest.expect(instance1).toBe(instance2);
      Vitest.expect(instance1).toBeInstanceOf(Config);
      Vitest.expect(instance1.name).toBe('app');
      Vitest.expect(instance1.port).toBe(3000);
    });

    Vitest.it('should only instantiate once', () => {
      let instantiationCount = 0;

      class Tracker {
        constructor() {
          instantiationCount++;
        }
      }

      const getTracker = Macro.singleton('tracker', Tracker);

      Vitest.expect(instantiationCount).toBe(0);

      getTracker();
      Vitest.expect(instantiationCount).toBe(1);

      getTracker();
      Vitest.expect(instantiationCount).toBe(1);

      getTracker();
      Vitest.expect(instantiationCount).toBe(1);
    });
  });

  Vitest.describe('with maker function', () => {
    Vitest.it('should create a singleton from a maker function with no arguments', () => {
      type State = { count: number };

      const makeState = (): State => ({ count: 0 });

      const getState = Macro.singleton('state-no-args', makeState);

      const instance1 = getState();
      const instance2 = getState();

      Vitest.expect(instance1).toBe(instance2);
      Vitest.expect(instance1.count).toBe(0);

      instance1.count++;

      Vitest.expect(instance1.count).toBe(1);
      Vitest.expect(instance2.count).toBe(1);
    });

    Vitest.it('should create a singleton from a maker function with arguments', () => {
      type Connection = { host: string; port: number; connected: boolean };

      const makeConnection = (host: string, port: number): Connection => ({
        host,
        port,
        connected: true,
      });

      const getConnection = Macro.singleton(
        'connection-with-args',
        makeConnection,
        'localhost',
        5432,
      );

      const instance1 = getConnection();
      const instance2 = getConnection();

      Vitest.expect(instance1).toBe(instance2);
      Vitest.expect(instance1.host).toBe('localhost');
      Vitest.expect(instance1.port).toBe(5432);
      Vitest.expect(instance1.connected).toBe(true);
    });

    Vitest.it('should only call maker function once', () => {
      let callCount = 0;

      const makeThing = () => {
        callCount++;
        return { id: callCount };
      };

      const getThing = Macro.singleton('thing', makeThing);

      Vitest.expect(callCount).toBe(0);

      const first = getThing();
      Vitest.expect(callCount).toBe(1);
      Vitest.expect(first.id).toBe(1);

      const second = getThing();
      Vitest.expect(callCount).toBe(1);
      Vitest.expect(second.id).toBe(1);

      getThing();
      Vitest.expect(callCount).toBe(1);
    });
  });

  Vitest.describe('error handling', () => {
    Vitest.it('should throw SingletonAlreadyExistsError when registering duplicate id', () => {
      class Service {}

      Macro.singleton('duplicate-id-test', Service);

      Vitest.expect(() => {
        Macro.singleton('duplicate-id-test', Service);
      }).toThrow(Macro.SingletonAlreadyExistsError);
    });

    Vitest.it('should throw with correct error message', () => {
      class Service {}

      Macro.singleton('duplicate-msg-test', Service);

      try {
        Macro.singleton('duplicate-msg-test', Service);
        Vitest.expect.fail('Should have thrown');
      } catch (error) {
        Vitest.expect(error).toBeInstanceOf(Macro.SingletonAlreadyExistsError);
        // SAFETY: the caught error was asserted to be a SingletonAlreadyExistsError above.
        Vitest.expect((error as Error).message).toContain('duplicate-msg-test');
      }
    });
  });

  Vitest.describe('lazy instantiation', () => {
    Vitest.it('should not instantiate until getter is called', () => {
      let instantiated = false;

      class LazyService {
        constructor() {
          instantiated = true;
        }
      }

      Macro.singleton('lazy-service', LazyService);

      Vitest.expect(instantiated).toBe(false);
    });

    Vitest.it('should instantiate on first getter call', () => {
      let instantiated = false;

      class LazyService {
        constructor() {
          instantiated = true;
        }
      }

      const getService = Macro.singleton('lazy-service-2', LazyService);

      Vitest.expect(instantiated).toBe(false);

      getService();

      Vitest.expect(instantiated).toBe(true);
    });
  });
});

Vitest.describe('[types] Macro.singleton', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.singleton;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should correctly type constructor-based singleton', () => {
    class MyClass {
      value = 42;
    }

    const _getMyClass = Macro.singleton('type-test-constructor', MyClass);

    type GetterType = typeof getMyClass;
    type InstanceType = ReturnType<GetterType>;

    Vitest.expectTypeOf<GetterType>().toEqualTypeOf<() => MyClass>();
    Vitest.expectTypeOf<InstanceType>().toEqualTypeOf<MyClass>();
  });

  Vitest.it('should correctly type maker-based singleton', () => {
    type Config = { value: number };

    const makeConfig = (): Config => ({ value: 42 });

    const _getConfig = Macro.singleton('type-test-maker', makeConfig);

    type GetterType = typeof getConfig;
    type InstanceType = ReturnType<GetterType>;

    Vitest.expectTypeOf<GetterType>().toEqualTypeOf<() => Config>();
    Vitest.expectTypeOf<InstanceType>().toEqualTypeOf<Config>();
  });
});
