import { extractPaddleText, normalizeOcrText } from "./ocr-utils.js?v=20261003-1";

const SDK_URL = new URL("../vendor/paddleocr/index.js", import.meta.url).href;
const WASM_URL = new URL("../vendor/paddleocr/", import.meta.url).href;

function withDeadline(promise, { timeoutMs, message, signal }) {
  return new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => finish(new DOMException("识别已取消", "AbortError"));
    const timer = setTimeout(() => finish(new Error(message)), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then((value) => finish(null, value), (error) => finish(error));
    if (signal?.aborted) onAbort();
  });
}

function dispose(instance) {
  Promise.resolve().then(() => instance?.dispose()).catch(() => {});
}

export function createPaddleClient({
  loadModule = () => import(SDK_URL),
  initializeTimeoutMs = 60000,
  predictTimeoutMs = 45000,
} = {}) {
  let ready = null;
  let model = null;
  let initializationController = null;
  let generation = 0;
  let request = 0;

  function reset() {
    generation += 1;
    initializationController?.abort();
    initializationController = null;
    dispose(model);
    model = null;
    ready = null;
  }

  function initialize() {
    if (ready) return ready;
    initializationController = new AbortController();
    const currentGeneration = generation;
    const pending = Promise.resolve().then(loadModule).then(async ({ PaddleOCR }) => {
      if (generation !== currentGeneration) throw new DOMException("识别已取消", "AbortError");
      if (!PaddleOCR?.create) throw new Error("本机识别组件不可用，请重新加载页面");
      const instance = await PaddleOCR.create({
        initialize: false,
        ocrVersion: "PP-OCRv6",
        lang: "ch",
        worker: true,
        ortOptions: { backend: "wasm", wasmPaths: WASM_URL, numThreads: 1, simd: true },
      });
      if (generation !== currentGeneration) {
        dispose(instance);
        throw new DOMException("识别已取消", "AbortError");
      }
      model = instance;
      await instance.initialize();
      return instance;
    });
    ready = withDeadline(pending, {
      signal: initializationController.signal,
      timeoutMs: initializeTimeoutMs,
      message: "识别模型加载超时，请检查网络后重试",
    });
    return ready;
  }

  return {
    async recognize(file, { signal, onProgress = () => {} } = {}) {
      signal?.throwIfAborted();
      const currentRequest = ++request;
      const onAbort = () => { if (request === currentRequest) reset(); };
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const instance = await withDeadline(initialize(), {
          signal,
          timeoutMs: initializeTimeoutMs,
          message: "识别模型加载超时，请检查网络后重试",
        });
        signal?.throwIfAborted();
        onProgress("正在本机识别图片，可取消后重新选择。");
        const result = await withDeadline(instance.predict(file, {
          textDetLimitSideLen: 2200,
          textRecScoreThresh: 0.2,
        }), {
          signal,
          timeoutMs: predictTimeoutMs,
          message: "图片识别超时，请裁剪图片或降低分辨率后重试",
        });
        return normalizeOcrText(extractPaddleText(result));
      } catch (error) {
        if (request === currentRequest) reset();
        throw error;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

export async function recognizeOnline(file, { signal, timeoutMs = 30000, fetchImpl = fetch } = {}) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const form = new FormData();
  form.append("file", file, file.name || "ocr-image.jpg");
  form.append("apikey", "helloworld");
  form.append("language", "chs");
  form.append("OCREngine", "2");
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  form.append("isOverlayRequired", "false");
  try {
    const payload = await withDeadline((async () => {
      const response = await fetchImpl("https://api.ocr.space/parse/image", {
        method: "POST", body: form, signal: controller.signal,
      });
      if (!response.ok) throw new Error(`在线服务返回 ${response.status}`);
      return response.json();
    })(), { signal, timeoutMs, message: "在线识别超时，请稍后重试" });
    const errors = [payload.ErrorMessage, payload.ErrorDetails].flat().filter(Boolean);
    if (payload.IsErroredOnProcessing || errors.length) throw new Error(errors.join("；") || "在线服务暂时不可用");
    return normalizeOcrText((payload.ParsedResults || []).map((result) => result.ParsedText || "").join("\n"));
  } finally {
    controller.abort();
    signal?.removeEventListener("abort", onAbort);
  }
}
