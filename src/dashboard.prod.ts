type DashboardValue = string | number | boolean | null | undefined;

export class Dashboard {
  constructor(_enabled = false) {}

  set(_name: string, _value: DashboardValue): void {}

  sample(_name: string, value: number, _maxSamples = 100): number {
    return value;
  }

  stop(): void {}
}
