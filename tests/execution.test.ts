import { describe, expect, it } from 'vitest';
import { ExecutionMachine } from '@wtrader/execution';

describe('ExecutionMachine', () => {
  it('runs the verified success path', () => {
    const machine = new ExecutionMachine();
    expect(machine.transition('RESERVE')).toBe('RESERVED');
    expect(machine.transition('VALIDATE')).toBe('VALIDATING');
    expect(machine.transition('CLICK')).toBe('CLICKING');
    expect(machine.transition('CONFIRM')).toBe('CONFIRMING');
    expect(machine.transition('VERIFY')).toBe('VERIFYING');
    expect(machine.transition('SUCCESS')).toBe('SUCCEEDED');
  });

  it('rejects invalid transitions', () => {
    const machine = new ExecutionMachine();
    expect(() => machine.transition('SUCCESS')).toThrow('Invalid execution transition');
  });

  it('requires resolution after ambiguous evidence', () => {
    const machine = new ExecutionMachine();
    machine.transition('RESERVE');
    machine.transition('VALIDATE');
    machine.transition('CLICK');
    expect(machine.transition('AMBIGUOUS')).toBe('UNKNOWN');
    expect(machine.transition('FAIL')).toBe('FAILED');
  });
});
