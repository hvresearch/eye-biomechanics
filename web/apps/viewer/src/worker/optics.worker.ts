/// <reference lib="webworker" />
import { handle } from "./handle";
import { runEyesJob } from "./jobs";
import { isFailure, isJobRequest, transferables, type JobMessage, type OpticsFailure, type OpticsResponse, type WorkerRequest } from "./messages";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (isJobRequest(req)) {
    let job: JobMessage;
    try {
      job = { kind: "job", id: req.id, result: runEyesJob(req.job) };
    } catch (e) {
      job = { kind: "job", id: req.id, error: message(e) };
    }
    ctx.postMessage(job);
    return;
  }
  let out: OpticsResponse | OpticsFailure;
  try {
    out = handle(req);
  } catch (e) {
    out = { id: req.id, error: message(e) };
  }
  ctx.postMessage(out, isFailure(out) ? [] : transferables(out));
};
