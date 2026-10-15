import * as THREE from 'three';
import { loadPrefs } from './ui/prefs';

/**
 * Low graphics (the setting in the main menu; 'auto' = on phones and tablets): no antialiasing and a
 * lower resolution – on big screens a bit below the window size. Antialiasing is fixed when the WebGL
 * context is created, so a change of the setting reloads the page.
 */
const level = loadPrefs().graphics;
const lowGraphics = level === 'low' || (level !== 'high' && (window.matchMedia?.('(pointer: coarse)').matches ?? false));

/** One WebGL renderer for the whole app (menus and races). */
export const renderer = new THREE.WebGLRenderer({ antialias: !lowGraphics, powerPreference: 'high-performance' });
renderer.setPixelRatio(lowGraphics ? (window.innerWidth >= 1400 ? 0.75 : 1) : Math.min(window.devicePixelRatio, 1.5));
renderer.domElement.id = 'view';
document.getElementById('app')!.prepend(renderer.domElement);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
window.addEventListener('resize', resize);
resize();

export interface Viewport {
  camera: THREE.PerspectiveCamera;
  /** fractions of the canvas: x, y (from top), w, h */
  rect: [number, number, number, number];
}

export function renderViewports(scene: THREE.Scene, views: Viewport[]) {
  const size = renderer.getSize(new THREE.Vector2());
  renderer.setScissorTest(true);
  for (const v of views) {
    const [fx, fy, fw, fh] = v.rect;
    const x = fx * size.x, w = fw * size.x, h = fh * size.y;
    const y = size.y - (fy * size.y + h);
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    const aspect = w / h;
    if (Math.abs(v.camera.aspect - aspect) > 1e-3) {
      v.camera.aspect = aspect;
      v.camera.updateProjectionMatrix();
    }
    renderer.render(scene, v.camera);
  }
  renderer.setScissorTest(false);
}
