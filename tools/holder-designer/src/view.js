import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/** One vessel standing on z = 0: a turned profile for round ones, a box for square ones. */
export function vesselGeometry(v) {
  if (v.shape === 'square') {
    return new THREE.BoxGeometry(v.body, v.body, v.length).translate(0, 0, v.length / 2);
  }
  const rb = v.body / 2;
  const rt = Math.max(v.top / 2, rb);
  const cap = Math.min(8, v.length * 0.15);
  const pts = [[0, 0], [Math.min(rb, v.cone ? rb * 0.25 : rb), 0], [rb, v.cone || 0.01], [rb, v.length - cap]];
  if (rt > rb + 0.05) pts.push([rt, v.length - cap]);
  pts.push([rt, v.length], [0, v.length]);
  // Lathe turns around Y; lay it over so the vessel stands along Z.
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 32).rotateX(Math.PI / 2);
}

const dark = window.matchMedia('(prefers-color-scheme: dark)');

export function materials() {
  const mat = {
    body: new THREE.MeshStandardMaterial({ metalness: 0.05, roughness: 0.7 }),
    edge: new THREE.LineBasicMaterial(),
    vessel: new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.38, roughness: 0.3, depthWrite: false }),
  };
  mat.theme = () => {
    const d = dark.matches;
    mat.body.color.set(d ? 0x8fb3ba : 0xa9bcc2);
    mat.edge.color.set(d ? 0x0d1416 : 0x23393f);
    mat.vessel.color.set(d ? 0xbfe6f2 : 0x3d8fb0);
  };
  mat.theme();
  return mat;
}

export function lights(scene, camera) {
  const sky = new THREE.HemisphereLight(0xffffff, 0x4a5458, 1.0);
  sky.position.set(0, 0, 1);
  scene.add(sky);
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(-0.6, 1.2, 1);
  camera.add(key);
  scene.add(camera);
}

/** Empties `root`, then puts the holder and (if given) the vessels in it. */
function fill(root, mat, mesh, vessels) {
  for (const child of [...root.children]) {
    root.remove(child);
    child.traverse((o) => o.geometry && o.geometry.dispose());
  }
  if (!mesh) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  root.add(new THREE.Mesh(toCreasedNormals(geo, Math.PI / 6), mat.body));
  root.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), mat.edge));
  geo.dispose();
  if (vessels) {
    const inst = new THREE.InstancedMesh(vesselGeometry(vessels.v), mat.vessel, vessels.at.length);
    const m = new THREE.Matrix4();
    vessels.at.forEach(([x, y], i) => inst.setMatrixAt(i, m.makeTranslation(x, y, vessels.rest)));
    inst.renderOrder = 1;
    root.add(inst);
  }
}

/** Distance at which a sphere just fits the camera's narrower field of view. */
export function fitDistance(camera, radius, margin = 1.05) {
  const half = (camera.fov * Math.PI) / 360;
  const halfWide = Math.atan(Math.tan(half) * camera.aspect);
  return (radius / Math.sin(Math.min(half, halfWide))) * margin;
}

/** Z-up orbit view of the holder, optionally with the vessels standing in it. */
export function createView(el) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  camera.up.set(0, 0, 1);
  camera.position.set(140, -260, 200);

  lights(scene, camera);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', render);

  const mat = materials();
  function theme() {
    mat.theme();
    render();
  }
  dark.addEventListener('change', theme);

  const root = new THREE.Group();
  scene.add(root);
  let fitted = false;

  function render() {
    renderer.render(scene, camera);
  }
  function resize() {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  new ResizeObserver(resize).observe(el);

  function fit() {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // Fit to whichever is tighter, the height or the width of the view.
    const dist = fitDistance(camera, sphere.radius);
    const dir = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    controls.update();
    render();
  }

  /**
   * @param mesh { positions, indices } or null
   * @param vessels null, or { v, rest, at: [[x, y], ...] } to show the vessels in place
   */
  function setScene(mesh, vessels, refit = false) {
    fill(root, mat, mesh, vessels);
    if (mesh && (refit || !fitted)) {
      fitted = true;
      fit();
    } else {
      render();
    }
  }

  function snapshot() {
    render();
    return renderer.domElement.toDataURL('image/png');
  }

  theme();
  resize();
  return { setScene, fit, snapshot, element: renderer.domElement };
}

/**
 * Small still pictures of a holder, for the style picker. Returns
 * shot(mesh, vessels) -> PNG data URL, drawn in the current light or dark theme.
 */
export function createThumbnailer(w = 240, h = 176) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, w / h, 1, 20000);
  camera.up.set(0, 0, 1);
  lights(scene, camera);
  const mat = materials();
  const root = new THREE.Group();
  scene.add(root);
  const dir = new THREE.Vector3();

  /** `from`: direction from the holder to the camera, e.g. from below to show the underside. */
  return function shot(mesh, vessels, from = [0.62, -1.15, 1.05]) {
    dir.set(...from).normalize();
    mat.theme();
    fill(root, mat, mesh, vessels);
    const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
    camera.position.copy(sphere.center).addScaledVector(dir, fitDistance(camera, sphere.radius, 0.8));
    camera.lookAt(sphere.center);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  };
}
