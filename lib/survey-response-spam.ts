export interface ContinuousSurveySpamProgress {
  running: boolean;
  totalSubmitted: number;
  errors: string[];
  durations: number[];
  timestamps: number[];
  averageDurationMs: number | null;
  submissionsPerSecond: number | null;
  overallSubmissionsPerSecond: number | null;
  startedAtMs: number | null;
  stoppedAtMs: number | null;
}

interface RunningTest {
  spamFunc: () => Promise<void>;
  progress: ContinuousSurveySpamProgress;
  abortController: AbortController;
}

// Store with testId -> running test data
const store = new Map<string, RunningTest>();

let nextId = 0;
let currentActiveTestId: string | null = null;

function generateTestId(): string {
  nextId += 1;
  return `spam-${Date.now()}-${nextId}`;
}

export function getContinuousSurveySpamProgress(
  testId: string,
): ContinuousSurveySpamProgress | null {
  const test = store.get(testId);
  if (!test) return null;

  // Recalculate current SPS based on last 100 operations
  let submissionsPerSecond: number | null = null;
  if (test.progress.timestamps.length >= 2) {
    const lastTimestamp =
      test.progress.timestamps[test.progress.timestamps.length - 1];
    const firstTimestamp = test.progress.timestamps[0];
    const timeSpanMs = lastTimestamp - firstTimestamp;

    if (timeSpanMs > 0) {
      submissionsPerSecond = Number(
        ((test.progress.timestamps.length * 1000) / timeSpanMs).toFixed(2),
      );
    }
  }

  // Calculate overall SPS based on entire lifetime
  let overallSubmissionsPerSecond: number | null = null;
  if (test.progress.startedAtMs !== null) {
    const elapsedMs = test.progress.running
      ? Date.now() - test.progress.startedAtMs
      : (test.progress.stoppedAtMs ?? Date.now()) - test.progress.startedAtMs;

    if (elapsedMs > 0) {
      overallSubmissionsPerSecond = Number(
        ((test.progress.totalSubmitted * 1000) / elapsedMs).toFixed(2),
      );
    }
  }

  return {
    ...test.progress,
    submissionsPerSecond,
    overallSubmissionsPerSecond,
  };
}

export function stopContinuousSurveySpam(testId: string): boolean {
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

export interface SpamConfig {
  surveys: Array<{ surveyKey: string }>;
  submissionsPerSecond: number;
  loadAndSubmitFn: (
    surveyKey: string,
  ) => Promise<{ durationMs: number; error?: string }>;
}

export function startContinuousSurveySpam(config: SpamConfig): string {
  // Stop any previously running test to prevent orphaned processes after hot reload
  if (currentActiveTestId) {
    stopContinuousSurveySpam(currentActiveTestId);
  }

  const testId = generateTestId();
  currentActiveTestId = testId;
  const abortController = new AbortController();

  const progress: ContinuousSurveySpamProgress = {
    running: true,
    totalSubmitted: 0,
    errors: [],
    durations: [],
    timestamps: [],
    averageDurationMs: null,
    submissionsPerSecond: null,
    overallSubmissionsPerSecond: null,
    startedAtMs: Date.now(),
    stoppedAtMs: null,
  };

  // Calculate delay between submissions (0 = unlimited, no delay)
  const delayMs =
    config.submissionsPerSecond > 0 ? 1000 / config.submissionsPerSecond : 0;

  // Spam function that runs in background
  const spamFunc = async () => {
    while (!abortController.signal.aborted) {
      try {
        // Pick random survey
        const survey =
          config.surveys[Math.floor(Math.random() * config.surveys.length)];
        if (!survey) break;

        // Execute load + submit (participant selection happens in the function)
        const result = await config.loadAndSubmitFn(survey.surveyKey);

        progress.totalSubmitted += 1;
        progress.durations.push(result.durationMs);
        progress.timestamps.push(Date.now());

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

        // Update average
        if (progress.durations.length > 0) {
          const sum = progress.durations.reduce((a, b) => a + b, 0);
          progress.averageDurationMs = Number(
            (sum / progress.durations.length).toFixed(2),
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        progress.errors.push(`Workflow error: ${errorMsg}`);
        if (progress.errors.length > 50) {
          progress.errors.shift();
        }
      }

      // Wait before next submission
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }

    // Mark as stopped
    progress.running = false;
    progress.stoppedAtMs = Date.now();
  };

  const test: RunningTest = {
    spamFunc,
    progress,
    abortController,
  };

  store.set(testId, test);

  // Fire and forget
  spamFunc().catch((err) => {
    console.error(`Spam test ${testId} failed:`, err);
  });

  return testId;
}
