// Time left for a batch job, estimated from how fast it has gone so far.
// With several requests in flight, completions per second is the right rate.
export function estimateRemainingMs(startedAt: number, now: number, done: number, total: number): number | null {
  if (done <= 0 || done >= total) return null;
  return ((now - startedAt) / done) * (total - done);
}

export function formatEta(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `~${seconds} s left`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  return `~${hours} h ${minutes % 60} min left`;
}
