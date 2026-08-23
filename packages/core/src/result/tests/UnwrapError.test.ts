import * as Vitest from 'vitest';

import * as Domain from '../../domain/index.js';
import * as Result from '../index.js';

Vitest.describe('[runtime] Result.UnwrapError', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.UnwrapError).toBeDefined();
  });

  Vitest.it('should be an Error subclass', () => {
    const error = new Result.UnwrapError();

    Vitest.expect(error).toBeInstanceOf(Error);
    Vitest.expect(error).toBeInstanceOf(Result.UnwrapError);
  });

  Vitest.it("should carry the package-wide 'Domain.Tag' value", () => {
    const error = new Result.UnwrapError();

    Vitest.expect(error[Domain.Tag]).toBe('unwrap-error');
  });

  Vitest.it('should embed a JSON snippet of the payload in the message', () => {
    const error = new Result.UnwrapError({ reason: 'boom' });

    Vitest.expect(error.message).toContain('Result is "Err"');
    Vitest.expect(error.message).toContain('{"reason":"boom"}');
  });

  Vitest.it('should omit the payload snippet when the payload is undefined', () => {
    const error = new Result.UnwrapError(undefined);

    Vitest.expect(error.message).toBe('Result is "Err". Unwrap operation failed');
  });

  Vitest.it('should fall back to String() for circular payloads without throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const error = new Result.UnwrapError(circular);

    Vitest.expect(error.message).toContain('[object Object]');
  });
});

Vitest.describe('[types] Result.UnwrapError', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.UnwrapError;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should extend Error', () => {
    Vitest.expectTypeOf(new Result.UnwrapError()).toBeInstanceOf(Error);
  });
});
