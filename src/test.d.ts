import { Scope } from 'effector';

declare module 'vitest' {
  export interface TestContext {
    scope: Scope;
  }
}
