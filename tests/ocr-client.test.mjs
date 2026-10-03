import assert from "node:assert/strict";
import test from "node:test";
import { createPaddleClient, recognizeOnline } from "../public/app/ocr-client.js";

function model(overrides = {}) {
  return {
    initialize: async () => {},
    predict: async () => "单边55公分 40片",
    dispose: async () => {},
    ...overrides,
  };
}

test("初始化失败后重试会重新加载 SDK，成功后复用模型", async () => {
  let loads = 0;
  const client = createPaddleClient({
    loadModule: async () => {
      if (++loads === 1) throw new Error("network unavailable");
      return { PaddleOCR: { create: async () => model() } };
    },
  });
  await assert.rejects(client.recognize(new Blob()), /network unavailable/);
  assert.equal(await client.recognize(new Blob()), "单边55公分 40片");
  await client.recognize(new Blob());
  assert.equal(loads, 2);
});

test("模型初始化和推理都有超时，失败实例会释放", async () => {
  for (const phase of ["initialize", "predict"]) {
    let disposed = false;
    const client = createPaddleClient({
      initializeTimeoutMs: 15,
      predictTimeoutMs: 15,
      loadModule: async () => ({ PaddleOCR: { create: async () => model({
        [phase]: () => new Promise(() => {}),
        dispose: async () => { disposed = true; },
      }) } }),
    });
    await assert.rejects(client.recognize(new Blob()), /超时/);
    assert.equal(disposed, true);
  }
});

test("取消加载会马上退出，迟到的模块不会再初始化模型", async () => {
  let complete;
  let created = false;
  const client = createPaddleClient({ loadModule: () => new Promise((resolve) => { complete = resolve; }) });
  const controller = new AbortController();
  const result = client.recognize(new Blob(), { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  complete({ PaddleOCR: { create: async () => { created = true; return model(); } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(created, false);
});

test("在线识别超时会终止网络请求，接口错误不会当成空白成功", async () => {
  let requestSignal;
  await assert.rejects(recognizeOnline(new Blob(), {
    timeoutMs: 15,
    fetchImpl: (_url, options) => {
      requestSignal = options.signal;
      return new Promise(() => {});
    },
  }), /超时/);
  assert.equal(requestSignal.aborted, true);
  await assert.rejects(recognizeOnline(new Blob(), {
    fetchImpl: async () => ({ ok: true, json: async () => ({ IsErroredOnProcessing: true, ErrorMessage: ["额度已用完"] }) }),
  }), /额度已用完/);
});
