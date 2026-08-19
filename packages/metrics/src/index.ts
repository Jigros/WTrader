export interface LatencySummary {
  readonly count: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

export class LatencyProfiler {
  private readonly values = new Map<string, number[]>();

  measure<T>(name: string, operation: () => T): T {
    const startedAt = performance.now();
    try {
      return operation();
    } finally {
      this.record(name, performance.now() - startedAt);
    }
  }

  async measureAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await operation();
    } finally {
      this.record(name, performance.now() - startedAt);
    }
  }

  record(name: string, milliseconds: number): void {
    const values = this.values.get(name) ?? [];
    values.push(milliseconds);
    this.values.set(name, values);
  }

  summary(name: string): LatencySummary {
    const values = [...(this.values.get(name) ?? [])].sort((left, right) => left - right);
    return {
      count: values.length,
      p50: quantile(values, 0.5),
      p90: quantile(values, 0.9),
      p95: quantile(values, 0.95),
      p99: quantile(values, 0.99),
    };
  }
}

function quantile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(percentile * values.length) - 1)] ?? 0;
}
