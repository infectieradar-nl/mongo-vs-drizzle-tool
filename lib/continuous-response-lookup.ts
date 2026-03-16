export interface ContinuousResponseLookupProgress {
  running: boolean;
  totalLookupsExecuted: number;
  errors: string[];
  durations: number[];
  timestamps: number[];
  averageDurationMs: number | null;
  lookupsPerSecond: number | null;
  overallLookupsPerSecond: number | null;
  startedAtMs: number | null;
  stoppedAtMs: number | null;
  totalResponsesReturned: number;
  avgResponsesPerParticipant: number | null;
}

interface RunningTest {
  lookupFunc: () => Promise<void>;
  progress: ContinuousResponseLookupProgress;
  abortController: AbortController;
}

// Store with testId -> running test data
const store = new Map<string, RunningTest>();

let nextId = 0;
let currentActiveTestId: string | null = null;

function generateTestId(): string {
  nextId += 1;
  return `lookup-${Date.now()}-${nextId}`;
}

export function getContinuousResponseLookupProgress(
  testId: string,
): ContinuousResponseLookupProgress | null {
  const test = store.get(testId);
  if (!test) return null;

  // Recalculate current LPS based on last 100 operations
  let lookupsPerSecond: number | null = null;
  if (test.progress.timestamps.length >= 2) {
    const lastTimestamp =
      test.progress.timestamps[test.progress.timestamps.length - 1];
    const firstTimestamp = test.progress.timestamps[0];
    const timeSpanMs = lastTimestamp - firstTimestamp;

    if (timeSpanMs > 0) {
      lookupsPerSecond = Number(
        ((test.progress.timestamps.length * 1000) / timeSpanMs).toFixed(2),
      );
    }
  }

  // Calculate overall LPS based on entire lifetime
  let overallLookupsPerSecond: number | null = null;
  if (test.progress.startedAtMs !== null) {
    const elapsedMs = test.progress.running
      ? Date.now() - test.progress.startedAtMs
      : (test.progress.stoppedAtMs ?? Date.now()) - test.progress.startedAtMs;

    if (elapsedMs > 0) {
      overallLookupsPerSecond = Number(
        ((test.progress.totalLookupsExecuted * 1000) / elapsedMs).toFixed(2),
      );
    }
  }

  return {
    ...test.progress,
    lookupsPerSecond,
    overallLookupsPerSecond,
  };
}

export function stopContinuousResponseLookup(testId: string): boolean {
  const test = store.get(testId);
  if (!test) return false;

  test.abortController.abort();
  test.progress.running = false;
  test.progress.stoppedAtMs = Date.now();

  // Clear active test ID if this was the active one
  if (currentActiveTestId === testId) {
    currentActiveTestId = null;
  }

  // Clean up after a short delay
  setTimeout(() => {
    store.delete(testId);
  }, 60000); // Keep in store for 1 minute after stopping

  return true;
}

export interface LookupConfig {
  lookupsPerSecond: number;
  batchSize: number;
  lookupFn: () => Promise<{
    durationMs: number;
    responseCount?: number;
    error?: string;
  }>;
}

export function startContinuousResponseLookup(config: LookupConfig): string {
  // Stop any previously running test to prevent orphaned processes after hot reload
  if (currentActiveTestId) {
    stopContinuousResponseLookup(currentActiveTestId);
  }

  const testId = generateTestId();
  currentActiveTestId = testId;
  const abortController = new AbortController();

  const progress: ContinuousResponseLookupProgress = {
    running: true,
    totalLookupsExecuted: 0,
    errors: [],
    durations: [],
    timestamps: [],
    averageDurationMs: null,
    lookupsPerSecond: null,
    overallLookupsPerSecond: null,
    startedAtMs: Date.now(),
    stoppedAtMs: null,
    totalResponsesReturned: 0,
    avgResponsesPerParticipant: null,
  };

  // Calculate delay between lookups (0 = unlimited, no delay)
  const delayMs =
    config.lookupsPerSecond > 0 ? 1000 / config.lookupsPerSecond : 0;

  // Lookup function that runs in background
  const lookupFunc = async () => {
    while (!abortController.signal.aborted) {
      try {
        // Execute lookup
        const result = await config.lookupFn();

        progress.totalLookupsExecuted += 1;
        progress.durations.push(result.durationMs);
        progress.timestamps.push(Date.now());

        // Track responses returned
        if (result.responseCount !== undefined) {
          progress.totalResponsesReturned += result.responseCount;
        }

        // Keep only last 100 durations and timestamps to avoid memory bloat
        if (progress.durations.length > 100) {
          progress.durations.shift();
          progress.timestamps.shift();
        }

        if (result.error) {
          progress.errors.push(result.error);
          // Keep only last 50 errors
          if (progress.errors.length > 50) {
            progress.errors.shift();
          }
        }

        // Update averages
        if (progress.durations.length > 0) {
          const sum = progress.durations.reduce((a, b) => a + b, 0);
          progress.averageDurationMs = Number(
            (sum / progress.durations.length).toFixed(2),
          );
        }

        if (progress.totalLookupsExecuted > 0) {
          progress.avgResponsesPerParticipant = Number(
            (
              progress.totalResponsesReturned / progress.totalLookupsExecuted
            ).toFixed(2),
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        progress.errors.push(`Workflow error: ${errorMsg}`);
        if (progress.errors.length > 50) {
          progress.errors.shift();
        }
      }

      // Wait before next lookup
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }

    // Mark as stopped
    progress.running = false;
    progress.stoppedAtMs = Date.now();
  };

  const test: RunningTest = {
    lookupFunc,
    progress,
    abortController,
  };

  store.set(testId, test);

  // Fire and forget
  lookupFunc().catch((err) => {
    console.error(`Lookup test ${testId} failed:`, err);
  });

  return testId;
}
