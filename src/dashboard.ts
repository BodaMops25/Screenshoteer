type DashboardValue = string | number | boolean | null | undefined;

type AverageMetric = {
  samples: number[];
  nextIndex: number;
  maxSamples: number;
};

export class Dashboard {
  private readonly enabled: boolean;
  private readonly values = new Map<string, DashboardValue>();
  private readonly averages = new Map<string, AverageMetric>();
  private readonly refreshTimer?: NodeJS.Timeout;
  private renderedRowCount = 0;

  constructor(enabled = true, refreshIntervalMs = 250) {
    this.enabled = enabled;
    if (enabled) {
      this.refreshTimer = setInterval(() => this.render(), refreshIntervalMs);
      this.refreshTimer.unref();
    }
  }

  set(name: string, value: DashboardValue): void {
    this.values.set(name, value);
  }

  sample(name: string, value: number, maxSamples = 100): number {
    let metric = this.averages.get(name);
    if (!metric || metric.maxSamples !== maxSamples) {
      metric = { samples: [], nextIndex: 0, maxSamples };
      this.averages.set(name, metric);
    }

    if (metric.samples.length < maxSamples) metric.samples.push(value);
    else {
      metric.samples[metric.nextIndex] = value;
      metric.nextIndex = (metric.nextIndex + 1) % maxSamples;
    }

    const average = metric.samples.reduce((sum, sample) => sum + sample, 0)
      / metric.samples.length;
    this.set(name, average);
    return average;
  }

  stop(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.render();
    if (this.enabled && process.stdout.isTTY) process.stdout.write('\n');
  }

  private render(): void {
    if (!this.enabled || !process.stdout.isTTY) return;

    const parts = [...this.values].map(([name, value]) => (
      `${name}: ${this.formatValue(value)}`
    ));
    const rows = this.packRows(parts, Math.max(20, (process.stdout.columns ?? 80) - 1));

    if (this.renderedRowCount > 0) {
      process.stdout.write('\r');
      if (this.renderedRowCount > 1) {
        process.stdout.write(`\x1b[${this.renderedRowCount - 1}A`);
      }
      process.stdout.write('\x1b[0J');
    }

    process.stdout.write(rows.join('\r\n'));
    this.renderedRowCount = rows.length;
  }

  private formatValue(value: DashboardValue): string {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value.toString() : value.toFixed(4);
    }
    return String(value ?? '-');
  }

  private packRows(parts: string[], width: number): string[] {
    const rows: string[] = [];
    let row = '';
    let itemsInRow = 0;

    for (const originalPart of parts) {
      const part = originalPart.slice(0, width);
      const candidate = row ? `${row} | ${part}` : part;
      if (row && (candidate.length > width || itemsInRow >= 3)) {
        rows.push(row);
        row = part;
        itemsInRow = 1;
      } else {
        row = candidate;
        itemsInRow++;
      }
    }
    if (row) rows.push(row);
    return rows.length > 0 ? rows : [''];
  }
}
