import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "public/vendor/paddleocr");
await mkdir(output, { recursive: true });
await build({
  entryPoints: [path.join(root, "node_modules/@paddleocr/paddleocr-js/dist/index.mjs")],
  outdir: output,
  entryNames: "index",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  external: ["fs", "path", "crypto", "node:*"],
  logLevel: "info",
});
await cp(path.join(root, "node_modules/@paddleocr/paddleocr-js/dist/assets"), path.join(output, "assets"), { recursive: true });
// The SDK's prebuilt worker uses ORT 1.24.3; copy binaries from that exact package.
for (const file of [
  "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm",
]) {
  await cp(path.join(root, "node_modules/onnxruntime-web/dist", file), path.join(output, file));
}
