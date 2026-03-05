export interface StressTestConfig {
  totalCount: number;
  concurrencyLimit: number;
  deleteAfterwards: boolean;
}

export interface StressTestProgress {
  total: number;
  completed: number;
  failed: number;
  running: boolean;
  durations: number[];
  averageDurationMs: number | null;
  totalDurationMs: number | null;
  errors: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthInstance = any;

const store = new Map<string, StressTestProgress>();

export const emailPrefix = "dummy-";
const initialPassword = "stresstest-pwd";

let nextId = 0;
function generateTestId(): string {
  nextId += 1;
  return `stress-${Date.now()}-${nextId}`;
}

export function getStressTestProgress(
  testId: string,
): StressTestProgress | null {
  return store.get(testId) ?? null;
}

export function startStressTest(
  auth: AuthInstance,
  cookiePrefix: string,
  config: StressTestConfig,
): string {
  const testId = generateTestId();
  const startTime = performance.now();

  const progress: StressTestProgress = {
    total: config.totalCount,
    completed: 0,
    failed: 0,
    running: true,
    durations: [],
    averageDurationMs: null,
    totalDurationMs: null,
    errors: [],
  };
  store.set(testId, progress);

  void runAllWorkflows(auth, cookiePrefix, config, progress)
    .finally(() => {
      const endTime = performance.now();
      progress.running = false;
      progress.totalDurationMs = Number((endTime - startTime).toFixed(2));
      if (progress.durations.length > 0) {
        const sum = progress.durations.reduce((a, b) => a + b, 0);
        progress.averageDurationMs = Number(
          (sum / progress.durations.length).toFixed(2),
        );
      }
    })
    .catch(() => {
      // Silently catch errors
    });

  return testId;
}

async function runSingleWorkflow(
  auth: AuthInstance,
  cookiePrefix: string,
  index: number,
  deleteAfterwards: boolean,
): Promise<number> {
  const email = `${emailPrefix}${Date.now()}-${index}@benchmark.test`;
  const start = performance.now();

  try {
    await auth.api.signUpEmail({
      body: { name: `Dummy User ${index}`, email, password: initialPassword },
    });

    const signInResponse = await auth.api.signInEmail({
      body: { email, password: initialPassword },
      returnHeaders: true,
    });
    const signInData = (
      signInResponse as unknown as {
        response?: { token?: string; user?: { id: string } };
      }
    )?.response;
    const signInHeaders = (signInResponse as unknown as { headers?: Headers })
      ?.headers;
    const token = (signInData as unknown as { token?: string })?.token;

    if (!token) {
      throw new Error(
        `No token returned for ${email}. SignIn response: ${JSON.stringify(signInData)}`,
      );
    }

    const authHeaders = new Headers();
    const setCookieHeader = signInHeaders?.get("set-cookie");
    if (setCookieHeader) {
      const cookieValue = setCookieHeader.split(";")[0];
      authHeaders.set("cookie", cookieValue);
    } else {
      const cookieName = `${cookiePrefix}.session_token`;
      authHeaders.set("cookie", `${cookieName}=${token}`);
    }

    if (deleteAfterwards) {
      try {
        await auth.api.deleteUser({
          headers: authHeaders,
          body: { password: initialPassword },
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new Error(`deleteUser failed: ${errorMsg}`);
      }
    } else {
      try {
        await auth.api.signOut({ headers: authHeaders });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new Error(`signOut failed: ${errorMsg}`);
      }
    }
    return performance.now() - start;
  } catch (err) {
    throw err;
  }
}

async function runAllWorkflows(
  auth: AuthInstance,
  cookiePrefix: string,
  config: StressTestConfig,
  progress: StressTestProgress,
): Promise<void> {
  const { totalCount, concurrencyLimit, deleteAfterwards } = config;

  let activeCount = 0;
  const waitingQueue: Array<() => void> = [];

  async function acquireSlot() {
    while (activeCount >= concurrencyLimit) {
      await new Promise<void>((resolve) => {
        waitingQueue.push(resolve);
      });
    }
    activeCount++;
  }

  function releaseSlot() {
    activeCount--;
    const next = waitingQueue.shift();
    if (next) {
      next();
    }
  }

  const tasks: Promise<void>[] = [];

  for (let i = 0; i < totalCount; i++) {
    const task = acquireSlot().then(async () => {
      try {
        const duration = await runSingleWorkflow(
          auth,
          cookiePrefix,
          i,
          deleteAfterwards,
        );
        progress.durations.push(Number(duration.toFixed(2)));
        progress.completed++;
      } catch (err) {
        progress.failed++;
        progress.completed++;
        const msg = err instanceof Error ? err.message : String(err);
        if (progress.errors.length < 10) {
          progress.errors.push(`Workflow ${i}: ${msg}`);
        }
      } finally {
        releaseSlot();
      }
    });
    tasks.push(task);
  }

  await Promise.all(tasks);
}
