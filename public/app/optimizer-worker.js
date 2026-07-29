import { optimizeCutting } from "./optimizer.js";

self.addEventListener("message", (event) => {
  try {
    const { requestId, parts, settings } = event.data || {};
    const result = optimizeCutting(parts || [], settings || {});
    self.postMessage({ requestId, result });
  } catch (error) {
    self.postMessage({
      requestId: event.data?.requestId,
      error: error?.message || "排版计算失败",
    });
  }
});
