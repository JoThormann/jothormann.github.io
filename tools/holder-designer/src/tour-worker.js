// Builds the tour's models off the page's thread, so a page that embeds the
// tour keeps scrolling smoothly while the geometry kernel works.
import { loadKernel } from './geometry/kernel.js';
import { makeMesh } from './tour-build.js';

const kernel = loadKernel();
self.onmessage = async (e) => {
  const { key, p, cut } = e.data;
  try {
    const mesh = makeMesh(await kernel, p, cut);
    self.postMessage({ key, mesh }, [mesh.positions.buffer, mesh.indices.buffer]);
  } catch (err) {
    self.postMessage({ key, error: String(err && err.message || err) });
  }
};
