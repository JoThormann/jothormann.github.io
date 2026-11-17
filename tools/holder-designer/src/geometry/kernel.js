// Loads the Manifold kernel (WebAssembly, Apache-2.0) once.
// manifold-3d 3.2.1, kept in vendor/ so the page makes no outside requests.
const BASE = new URL('../../vendor/manifold/', import.meta.url).href;

let pending = null;

export function loadKernel() {
  if (!pending) {
    pending = (async () => {
      const { default: Module } = await import(/* @vite-ignore */ BASE + 'manifold.js');
      const wasm = await Module({ locateFile: (file) => BASE + file });
      wasm.setup();
      return wasm;
    })();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
