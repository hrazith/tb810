export type TimedResult<T> = {
  result: T;
  elapsedMs: number;
};

export async function measure<T>(promise: Promise<T>): Promise<TimedResult<T>> {
  const startedAt = process.hrtime.bigint();
  const result = await promise;
  return {
    result,
    elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
  };
}
