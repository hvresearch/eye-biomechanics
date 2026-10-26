/// <reference lib="webworker" />
import { handle } from "./handle";
import type { OpticsRequest, OpticsWorkerMessage } from "./messages";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<OpticsRequest>) => {
  const req = ev.data;
  let out: OpticsWorkerMessage;
  try {
    out = handle(req);
  } catch (e) {
    out = { id: req.id, error: e instanceof Error ? e.message : String(e) };
  }
  ctx.postMessage(out);
};
