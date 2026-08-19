export type SafetyMode = 'OBSERVE_ONLY' | 'ASSISTED' | 'LIVE' | 'PAUSED';

export function canDispatchFinancialAction(mode: SafetyMode): boolean {
  return mode === 'LIVE';
}

export function canRecordObservation(mode: SafetyMode): boolean {
  return mode !== 'PAUSED';
}
