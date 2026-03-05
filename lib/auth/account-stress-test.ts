import type { betterAuth } from "better-auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// Use any since we only call .api methods and don't care about the auth config types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthInstance = any;

// ---------------------------------------------------------------------------
// In-memory store – one entry per running / finished test
// ---------------------------------------------------------------------------

const store = new Map<string, StressTestProgress>();

let nextId = 0;
function generateTestId(): string {
  nextId += 1;
  return `stress-${Date.now()}-${nextId}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getStressTestProgress(testId: string): StressTestProgress | null {
  return store.get(testId) ?? null;
}

/**
 * Starts a stress test in the background and returns a testId that can be
 * polled via {@link getStressTestProgress}.
 */
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

  // console.log(`[StressTest] Created test ${testId}`);

  // Fire-and-forget – the caller polls progress via the query endpoint.
  void runAllWorkflows(auth, cookiePrefix, config, progress)
    .finally(() => {
      const endTime = performance.now();
      progress.running = false;
      progress.totalDurationMs = Number((endTime - startTime).toFixed(2));
      if (progress.durations.length > 0) {
        const sum = progress.durations.reduce((a, b) => a + b, 0);
        progress.averageDurationMs = Number((sum / progress.durations.length).toFixed(2));
      }
      // console.log(`[StressTest] Test ${testId} finished. Total duration: ${progress.totalDurationMs}ms, Average duration: ${progress.averageDurationMs}ms`);
    })
    .catch((err) => {
      // console.error(`[StressTest] Test ${testId} encountered fatal error:`, err);
    });

  return testId;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const NEW_PASSWORD = "changed-pwd-123";

async function runSingleWorkflow(
  auth: AuthInstance,
  cookiePrefix: string,
  index: number,
  deleteAfterwards: boolean,
): Promise<number> {
  const email = `stresstest-${Date.now()}-${index}@benchmark.test`;
  const password = "stresstest-pwd";
  const workflowId = `${index}-${Date.now()}`;
  const start = performance.now();

  const logPrefix = `[Workflow ${workflowId}]`;
  // console.log(`${logPrefix} Starting workflow for ${email}`);

  try {
    // 1. Sign up
    // console.log(`${logPrefix} Step 1: Signing up...`);
    const step1Start = performance.now();
    const signUpResult = await auth.api.signUpEmail({
      body: { name: `Stress User ${index}`, email, password },
    });
    const step1Duration = performance.now() - step1Start;
    // console.log(`${logPrefix} Step 1: Signup success (${step1Duration.toFixed(0)}ms)`, {
    //   userId: (signUpResult as unknown as { user?: { id: string } })?.user?.id,
    //   hasToken: !!(signUpResult as unknown as { token?: string })?.token,
    // });

    // 2. Sign in – returns a session token AND set-cookie headers
    // console.log(`${logPrefix} Step 2: Signing in...`);
    const step2Start = performance.now();
    const signInResponse = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    const step2Duration = performance.now() - step2Start;
    const signInData = (signInResponse as unknown as { response?: { token?: string; user?: { id: string } } })?.response;
    const signInHeaders = (signInResponse as unknown as { headers?: Headers })?.headers;
    const token = (signInData as unknown as { token?: string })?.token;
    
    // console.log(`${logPrefix} Step 2: Signin result (${step2Duration.toFixed(0)}ms)`, {
    //   token: token ? `${token.substring(0, 20)}...` : "MISSING",
    //   userId: (signInData as unknown as { user?: { id: string } })?.user?.id,
    //   hasCookie: !!signInHeaders?.get("set-cookie"),
    // });

    if (!token) {
      throw new Error(
        `No token returned for ${email}. SignIn response: ${JSON.stringify(signInData)}`
      );
    }

    // Build auth headers from the sign-in response
    const authHeaders = new Headers();
    const setCookieHeader = signInHeaders?.get("set-cookie");
    if (setCookieHeader) {
      // Set-Cookie format: "name=value; Path=/; ..."
      // Extract just the "name=value" part
      const cookieValue = setCookieHeader.split(";")[0];
      authHeaders.set("cookie", cookieValue);
      // console.log(`${logPrefix} Step 2: Auth headers prepared from Set-Cookie`, {
      //   cookieValue: cookieValue.substring(0, 80),
      // });
    } else {
      // Fallback: use the token directly
      const cookieName = `${cookiePrefix}.session_token`;
      authHeaders.set("cookie", `${cookieName}=${token}`);
      // console.log(`${logPrefix} Step 2: Auth headers prepared manually (no Set-Cookie)`, {
      //   cookieName,
      //   cookieValue: `${token.substring(0, 20)}...`,
      // });
    }

    // 3. Change password (authenticated)
    // console.log(`${logPrefix} Step 3: Changing password...`);
    const step3Start = performance.now();
    try {
      const changePwdResult = await auth.api.changePassword({
        headers: authHeaders,
        body: { currentPassword: password, newPassword: NEW_PASSWORD },
      });
      const step3Duration = performance.now() - step3Start;
      // console.log(`${logPrefix} Step 3: Password change success (${step3Duration.toFixed(0)}ms)`, {
      //   userId: (changePwdResult as unknown as { user?: { id: string } })?.user?.id,
      // });
    } catch (err) {
      const step3Duration = performance.now() - step3Start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `changePassword failed after ${step3Duration.toFixed(0)}ms: ${errorMsg}. Cookie: ${authHeaders.get("cookie")?.substring(0, 80)}`
      );
    }

    // 4a. Delete account  OR  4b. Sign out
    if (deleteAfterwards) {
      // console.log(`${logPrefix} Step 4: Deleting account...`);
      const step4Start = performance.now();
      try {
        await auth.api.deleteUser({
          headers: authHeaders,
          body: { password: NEW_PASSWORD },
        });
        const step4Duration = performance.now() - step4Start;
        // console.log(`${logPrefix} Step 4: Account deleted successfully (${step4Duration.toFixed(0)}ms)`);
      } catch (err) {
        const step4Duration = performance.now() - step4Start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new Error(`deleteUser failed after ${step4Duration.toFixed(0)}ms: ${errorMsg}`);
      }
    } else {
      // console.log(`${logPrefix} Step 4: Signing out...`);
      const step4Start = performance.now();
      try {
        await auth.api.signOut({ headers: authHeaders });
        const step4Duration = performance.now() - step4Start;
        // console.log(`${logPrefix} Step 4: Signed out successfully (${step4Duration.toFixed(0)}ms)`);
      } catch (err) {
        const step4Duration = performance.now() - step4Start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new Error(`signOut failed after ${step4Duration.toFixed(0)}ms: ${errorMsg}`);
      }
    }

    const duration = performance.now() - start;
    // console.log(`${logPrefix} Workflow completed in ${duration.toFixed(2)}ms`);
    return duration;
  } catch (err) {
    const duration = performance.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    // console.error(
    //   `${logPrefix} Workflow FAILED after ${duration.toFixed(2)}ms: ${errorMsg}`
    // );
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

  // console.log(`[StressTest] Starting with config:`, {
  //   totalCount,
  //   concurrencyLimit,
  //   deleteAfterwards,
  //   cookiePrefix,
  // });

  // Simple semaphore for concurrency control with queue
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

  // console.log(`[StressTest] Concurrency limit: ${concurrencyLimit} (max ${totalCount} parallel workflows)`);

  const tasks: Promise<void>[] = [];

  for (let i = 0; i < totalCount; i++) {
    const task = acquireSlot().then(async () => {
      try {
        const duration = await runSingleWorkflow(auth, cookiePrefix, i, deleteAfterwards);
        progress.durations.push(Number(duration.toFixed(2)));
        progress.completed++;
        // console.log(
        //   `[StressTest] Progress: ${progress.completed}/${totalCount} completed, ${progress.failed} failed. Active: ${activeCount}`
        // );
      } catch (err) {
        progress.failed++;
        progress.completed++;
        const msg = err instanceof Error ? err.message : String(err);
        // console.error(`[StressTest] Workflow ${i} failed:`, msg);
        if (progress.errors.length < 10) {
          progress.errors.push(`Workflow ${i}: ${msg}`);
        }
      } finally {
        releaseSlot();
      }
    });
    tasks.push(task);
  }

  // console.log(`[StressTest] Launched ${totalCount} workflow tasks`);
  await Promise.all(tasks);
  // console.log(`[StressTest] All workflows completed. Summary:`, {
  //   total: progress.total,
  //   completed: progress.completed,
  //   failed: progress.failed,
  //   avgDuration: progress.averageDurationMs,
  //   errors: progress.errors.length,
  // });
}
