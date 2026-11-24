/** Server-side Jensen sessions: how long he plays GTA 6 before jensen.returned is emitted. */
export const returnScenes = ["stage", "locker-room", "wolf"] as const;
export type ReturnScene = (typeof returnScenes)[number];

export interface ShowRun {
  id: string;
  startedAt: number;
  returnsAt: number;
  scene: ReturnScene;
  message: string;
  state: "running" | "returned" | "cancelled";
  returnedAt?: number;
  event?: { eventId: string; scene: ReturnScene; message: string };
}

export interface RunStore {
  get(): Promise<ShowRun | undefined>;
  put(run: ShowRun): Promise<void>;
}

export type Emit = (scene: ReturnScene, message: string) => Promise<string>;

export const MIN_PLAY_SECONDS = 5;
export const MAX_PLAY_SECONDS = 600;

export class ShowRuns {
  // Serializes start/emit/cancel so a timer and a click cannot both emit.
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private emit: Emit,
    private store: RunStore,
    /** Called with the next due time (or null) whenever it changes. */
    private schedule: (at: number | null) => void | Promise<void>,
  ) {}

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => {});
    return next;
  }

  start(input: { playSeconds: number; scene: ReturnScene; message: string }) {
    return this.serial(async () => {
      const now = Date.now();
      const run: ShowRun = {
        id: crypto.randomUUID(), startedAt: now, returnsAt: now + input.playSeconds * 1000,
        scene: input.scene, message: input.message, state: "running",
      };
      await this.store.put(run);
      await this.schedule(run.returnsAt);
      return run;
    });
  }

  /** Emits now if a run is in progress. */
  emitNow() {
    return this.serial(() => this.fire());
  }

  /** Emits only if the run's time is up. Call from timers, alarms and reads. */
  due() {
    return this.serial(async () => {
      const run = await this.store.get();
      return run?.state === "running" && Date.now() >= run.returnsAt ? this.fire() : run;
    });
  }

  cancel() {
    return this.serial(async () => {
      const run = await this.store.get();
      if (run?.state !== "running") return run;
      const cancelled: ShowRun = { ...run, state: "cancelled" };
      await this.store.put(cancelled);
      await this.schedule(null);
      return cancelled;
    });
  }

  state() {
    return this.due();
  }

  private async fire() {
    const run = await this.store.get();
    if (run?.state !== "running") return run;
    const eventId = await this.emit(run.scene, run.message);
    const returned: ShowRun = {
      ...run, state: "returned", returnedAt: Date.now(),
      event: { eventId, scene: run.scene, message: run.message },
    };
    await this.store.put(returned);
    await this.schedule(null);
    return returned;
  }
}

export function memoryRunStore(): RunStore {
  let run: ShowRun | undefined;
  return { async get() { return run; }, async put(next) { run = next; } };
}

/** setTimeout-backed scheduler for the Node server. */
export function timerSchedule(runs: () => ShowRuns) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (at: number | null) => {
    clearTimeout(timer);
    if (at !== null) {
      timer = setTimeout(() => void runs().due().catch(console.error), Math.max(0, at - Date.now()));
      timer.unref?.();
    }
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body ?? null), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function parseStart(body: unknown) {
  if (!body || typeof body !== "object") return "Send a JSON body.";
  const { playSeconds, scene, message } = body as Record<string, unknown>;
  if (typeof playSeconds !== "number" || !Number.isInteger(playSeconds) || playSeconds < MIN_PLAY_SECONDS || playSeconds > MAX_PLAY_SECONDS)
    return `playSeconds must be a whole number from ${MIN_PLAY_SECONDS} to ${MAX_PLAY_SECONDS}.`;
  if (typeof scene !== "string" || !(returnScenes as readonly string[]).includes(scene))
    return `scene must be one of ${returnScenes.join(", ")}.`;
  const text = typeof message === "string" ? message.trim() : "";
  if (!text || text.length > 120) return "message must be 1 to 120 characters.";
  return { playSeconds, scene: scene as ReturnScene, message: text };
}

/** Handles /jensen/run routes for an already authenticated caller. Returns null for other paths. */
export async function handleRunRequest(request: Request, runs: ShowRuns): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname === "/jensen/run") {
    if (request.method === "GET") return json(await runs.state());
    if (request.method === "DELETE") return json(await runs.cancel());
    if (request.method === "POST") {
      const input = parseStart(await request.json().catch(() => null));
      if (typeof input === "string") return json({ error: input }, 400);
      return json(await runs.start(input));
    }
    return json({ error: "Use GET, POST or DELETE." }, 405);
  }
  if (pathname === "/jensen/run/emit") {
    if (request.method !== "POST") return json({ error: "Use POST." }, 405);
    return json(await runs.emitNow());
  }
  return null;
}

export const controlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
