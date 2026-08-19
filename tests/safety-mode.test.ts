import { describe, expect, it } from 'vitest';
import { canDispatchFinancialAction, canRecordObservation } from '@wtrader/execution';

describe('safety modes', () => {
  it('permits financial dispatch only in LIVE mode', () => {
    expect(canDispatchFinancialAction('OBSERVE_ONLY')).toBe(false);
    expect(canDispatchFinancialAction('ASSISTED')).toBe(false);
    expect(canDispatchFinancialAction('PAUSED')).toBe(false);
    expect(canDispatchFinancialAction('LIVE')).toBe(true);
  });

  it('records observations unless paused', () => {
    expect(canRecordObservation('OBSERVE_ONLY')).toBe(true);
    expect(canRecordObservation('ASSISTED')).toBe(true);
    expect(canRecordObservation('LIVE')).toBe(true);
    expect(canRecordObservation('PAUSED')).toBe(false);
  });
});
