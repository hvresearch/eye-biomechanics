import { isFailure, type OpticsRequest, type OpticsResponse, type OpticsWorkerMessage } from "./messages";

/**
 * Typed wrapper around the optics worker. Only the most recent request is resolved;
 * earlier in-flight requests reject with `StaleRequestError` so the UI never shows a
 * result for a state it has already left.
 */
export class StaleRequestError extends Error {
  constructor(id: number) {
    super(`Optics request ${id} superseded`);
    this.name = "StaleRequestError";
  }
}

interface Pending {
  resolve: (r: OpticsResponse) => void;
  reject: (e: Error) => void;
}

export class OpticsClient {
  private readonly worker: Worker;
  private nextId = 1;
  private latestId = 0;
  private readonly pending = new Map<number, Pending>();

  constructor(worker?: Worker) {
    this.worker =
      worker ?? new Worker(new URL("./optics.worker.ts", import.meta.url), { type: "module", name: "optics" });
    this.worker.onmessage = (ev: MessageEvent<OpticsWorkerMessage>) => this.receive(ev.data);
    this.worker.onerror = (ev) => {
      for (const [id, p] of this.pending) {
        p.reject(new Error(`Optics worker error: ${ev.message}`));
        this.pending.delete(id);
      }
    };
  }

  request(req: Omit<OpticsRequest, "id">): Promise<OpticsResponse> {
    const id = this.nextId++;
    for (const [staleId, p] of this.pending) {
      p.reject(new StaleRequestError(staleId));
      this.pending.delete(staleId);
    }
    this.latestId = id;
    return new Promise<OpticsResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id });
    });
  }

  /** Handle one message from the worker (exposed for tests). */
  receive(msg: OpticsWorkerMessage): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.id !== this.latestId) {
      p.reject(new StaleRequestError(msg.id));
      return;
    }
    if (isFailure(msg)) p.reject(new Error(msg.error));
    else p.resolve(msg);
  }

  terminate(): void {
    this.worker.terminate();
  }
}
