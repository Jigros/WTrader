import type { ExecutionState } from '@wtrader/shared-types';

export type ExecutionEvent =
  | 'RESERVE'
  | 'VALIDATE'
  | 'CLICK'
  | 'CONFIRM'
  | 'VERIFY'
  | 'SUCCESS'
  | 'FAIL'
  | 'AMBIGUOUS';

const transitions: Readonly<Record<ExecutionState, Partial<Record<ExecutionEvent, ExecutionState>>>> = {
  DETECTED: { RESERVE: 'RESERVED', FAIL: 'FAILED' },
  RESERVED: { VALIDATE: 'VALIDATING', FAIL: 'FAILED' },
  VALIDATING: { CLICK: 'CLICKING', FAIL: 'FAILED' },
  CLICKING: { CONFIRM: 'CONFIRMING', VERIFY: 'VERIFYING', FAIL: 'FAILED', AMBIGUOUS: 'UNKNOWN' },
  CONFIRMING: { VERIFY: 'VERIFYING', FAIL: 'FAILED', AMBIGUOUS: 'UNKNOWN' },
  VERIFYING: { SUCCESS: 'SUCCEEDED', FAIL: 'FAILED', AMBIGUOUS: 'UNKNOWN' },
  SUCCEEDED: {},
  FAILED: {},
  UNKNOWN: { SUCCESS: 'SUCCEEDED', FAIL: 'FAILED' },
};

export class ExecutionMachine {
  private current: ExecutionState = 'DETECTED';

  get state(): ExecutionState {
    return this.current;
  }

  transition(event: ExecutionEvent): ExecutionState {
    const next = transitions[this.current][event];
    if (next === undefined) {
      throw new Error(`Invalid execution transition: ${this.current} -> ${event}`);
    }
    this.current = next;
    return next;
  }
}
