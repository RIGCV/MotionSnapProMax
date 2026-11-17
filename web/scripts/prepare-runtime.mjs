import { mkdir, copyFile, readdir, unlink } from 'node:fs/promises';
const source = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url);
const target = new URL('../public/runtime/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of await readdir(target)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(name) && !/^ort-wasm-simd-threaded\.asyncify\.(wasm|mjs)$/.test(name)) {
    await unlink(new URL(name, target));
  }
}
for (const name of await readdir(source)) {
  if (/^ort-wasm-simd-threaded\.asyncify\.(wasm|mjs)$/.test(name)) {
    await copyFile(new URL(name, source), new URL(name, target));
  }
}
console.log('ONNX Runtime assets prepared (same-origin, no CDN dependency).');
