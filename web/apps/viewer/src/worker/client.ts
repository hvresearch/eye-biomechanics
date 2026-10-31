import type { EyesJob, EyesJobResult } from "./jobs";
import { isFailure, isJobMessage, type JobRequest, type OpticsRequest, type OpticsResponse, type OpticsWorkerMessage } from "./messages";

/**
 * A request that was replaced by a newer one before it reached the worker. Its caller should
 * drop it silently.
 */
export class StaleRequestError extends Error {
  constructor(id: number) {
    super(`Optics request ${id} superseded`);
    this.name = "StaleRequestError";
  }
}

interface Pending {
  id: number;
  resolve: (r: OpticsResponse) => void;
  reject: (e: Error) => void;
}

interface Queued {
  body: Omit<OpticsRequest, "id">;
  resolve: (r: OpticsResponse) => void;
  reject: (e: Error) => void;
}

/**
 * Typed wrapper around the optics worker with backpressure: at most one request is in flight.
 * A request made while one is in flight waits; a newer one replaces it (the replaced caller gets
 * `StaleRequestError`), so the worker only ever computes the latest state once it is free. The
 * in-flight response still resolves: it is the newest result available, which keeps readouts
 * updating while inputs change faster than the worker can answer. Eye jobs (preset solving, the
 * decomposition) are never replaced: each resolves with its own result.
 */
export class OpticsClient {
  private readonly worker: Worker;
  private nextId = 1;
  private inFlight: Pending | null = null;
  private queued: Queued | null = null;
  private readonly jobs = new Map<number, { resolve: (r: EyesJobResult) => void; reject: (e: Error) => void }>();

  constructor(worker?: Worker) {
    this.worker =
      worker ?? new Worker(new URL("./optics.worker.ts", import.meta.url), { type: "module", name: "optics" });
    this.worker.onmessage = (ev: MessageEvent<OpticsWorkerMessage>) => this.receive(ev.data);
    this.worker.onerror = (ev) => {
      const err = new Error(`Optics worker error: ${ev.message}`);
      this.inFlight?.reject(err);
      this.inFlight = null;
      this.queued?.reject(err);
      this.queued = null;
      for (const j of this.jobs.values()) j.reject(err);
      this.jobs.clear();
    };
  }

  /** Run an eye job in the worker. */
  job(job: EyesJob): Promise<EyesJobResult> {
    return new Promise<EyesJobResult>((resolve, reject) => {
      const id = this.nextId++;
      this.jobs.set(id, { resolve, reject });
      const msg: JobRequest = { kind: "job", id, job };
      this.worker.postMessage(msg);
    });
  }

  request(body: Omit<OpticsRequest, "id">): Promise<OpticsResponse> {
    return new Promise<OpticsResponse>((resolve, reject) => {
      if (this.inFlight === null) {
        this.send({ body, resolve, reject });
        return;
      }
      if (this.queued) this.queued.reject(new StaleRequestError(-1));
      this.queued = { body, resolve, reject };
    });
  }

  private send(q: Queued): void {
    const id = this.nextId++;
    this.inFlight = { id, resolve: q.resolve, reject: q.reject };
    this.worker.postMessage({ ...q.body, id });
  }

  /** Handle one message from the worker (exposed for tests). */
  receive(msg: OpticsWorkerMessage): void {
    if (isJobMessage(msg)) {
      const j = this.jobs.get(msg.id);
      if (!j) return;
      this.jobs.delete(msg.id);
      if ("error" in msg) j.reject(new Error(msg.error));
      else j.resolve(msg.result);
      return;
    }
    const p = this.inFlight;
    if (!p || p.id !== msg.id) return;
    this.inFlight = null;
    if (isFailure(msg)) p.reject(new Error(msg.error));
    else p.resolve(msg);
    const q = this.queued;
    this.queued = null;
    if (q) this.send(q);
  }

  terminate(): void {
    this.worker.terminate();
  }
}
