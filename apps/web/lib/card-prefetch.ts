// Generates cards in the background for the words a scan found, so "Make card" is instant.
// The results go into a cache, not into the card list: queued cards would count as known words
// and hide words the learner has not chosen.

export interface PrefetchItem {
  word: string;
  sentence: string;
}

export interface PrefetchCache {
  get(key: string): Promise<string | undefined>;
  put(key: string, back: string): Promise<void>;
}

export interface PrefetchProgress {
  ready: number;
  total: number;
}

export interface PrefetchDeps {
  generate(word: string, sentence: string): Promise<string>;
  cache: PrefetchCache;
  concurrency?: number;
  cap?: number; // most words prefetched per scan; the rest are generated when asked for
  onProgress?(progress: PrefetchProgress): void;
  // Failures that every further request would repeat (bad access code, no credit): stop the queue.
  isFatal?(error: unknown): boolean;
}

export const cacheKey = (word: string, sentence: string) => `${word}|${sentence}`;

interface Job {
  key: string;
  word: string;
  sentence: string;
  promise?: Promise<string>;
  result?: string;
}

export class CardPrefetcher {
  private epoch = 0;
  private jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private running = 0;
  private ready = 0;
  private total = 0;

  constructor(private deps: PrefetchDeps) {}

  // Starts a scan's worth of background work, in reading order. A new scan replaces the old one.
  start(items: PrefetchItem[]): void {
    this.cancel();
    const cap = this.deps.cap ?? 20;
    for (const { word, sentence } of items.slice(0, cap)) {
      const key = cacheKey(word, sentence);
      if (this.jobs.has(key)) continue;
      const job: Job = { key, word, sentence };
      this.jobs.set(key, job);
      this.queue.push(job);
    }
    this.total = this.jobs.size;
    this.report();
    this.pump();
  }

  // Stops work that has not started. Calls already in flight finish and still fill the cache.
  cancel(): void {
    this.epoch++;
    this.jobs.clear();
    this.queue = [];
    this.running = 0;
    this.ready = 0;
    this.total = 0;
    this.report();
  }

  // The word is no longer wanted (the learner knows it): do not start it.
  drop(words: string[]): void {
    const gone = new Set(words);
    this.queue = this.queue.filter((job) => {
      if (!gone.has(job.word)) return true;
      this.jobs.delete(job.key);
      this.total--;
      return false;
    });
    this.report();
  }

  // The card for a word now: from the cache, from work already under way, or generated at once,
  // ahead of anything still waiting in the queue.
  async request(word: string, sentence: string): Promise<string> {
    const key = cacheKey(word, sentence);
    const known = this.jobs.get(key);
    if (known?.result !== undefined) return known.result;
    if (known?.promise) return known.promise;
    const job = known ?? { key, word, sentence };
    const at = this.queue.indexOf(job);
    if (at >= 0) this.queue.splice(at, 1);
    return this.run(job);
  }

  // A new card for a word, ignoring what was cached (Regenerate, Retry).
  async fresh(word: string, sentence: string): Promise<string> {
    const back = await this.deps.generate(word, sentence);
    await this.deps.cache.put(cacheKey(word, sentence), back);
    return back;
  }

  private run(job: Job): Promise<string> {
    if (job.promise) return job.promise;
    const epoch = this.epoch;
    const tracked = this.jobs.get(job.key) === job;
    job.promise = (async () => {
      try {
        let back = await this.deps.cache.get(job.key);
        if (back === undefined) {
          back = await this.deps.generate(job.word, job.sentence);
          await this.deps.cache.put(job.key, back);
        }
        job.result = back;
        if (tracked && epoch === this.epoch) {
          this.ready++;
          this.report();
        }
        return back;
      } catch (error) {
        // A failure is not remembered: the next request tries again.
        job.promise = undefined;
        if (this.jobs.get(job.key) === job && epoch === this.epoch) {
          this.jobs.delete(job.key);
          this.total--;
          this.report();
        }
        throw error;
      }
    })();
    return job.promise;
  }

  private pump(): void {
    const epoch = this.epoch;
    const limit = this.deps.concurrency ?? 3;
    while (this.running < limit && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.running++;
      this.run(job)
        .catch((error) => {
          if (epoch === this.epoch && this.deps.isFatal?.(error)) this.cancel();
        })
        .finally(() => {
          if (epoch !== this.epoch) return;
          this.running--;
          this.pump();
        });
    }
  }

  private report(): void {
    this.deps.onProgress?.({ ready: this.ready, total: this.total });
  }
}
