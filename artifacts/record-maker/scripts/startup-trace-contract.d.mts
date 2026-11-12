export const counterUnits: Readonly<Record<string, string>>;
export function inspectCounterTrace(rows: readonly unknown[]): {
  samples: number;
  validCounterSamples: number;
};
