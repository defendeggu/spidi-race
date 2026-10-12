import * as THREE from 'three';

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function checkerTexture() {
  return canvasTexture(256, 64, (g) => {
    const cols = 16, rows = 4, cw = 256 / cols, ch = 64 / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#eee';
        g.fillRect(x * cw, y * ch, cw, ch);
      }
  });
}

export function bannerTexture(text: string, sub: string) {
  return canvasTexture(1024, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#1d2b6b');
    grad.addColorStop(1, '#0b1236');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = '#ffcc00';
    g.fillRect(0, 0, 1024, 8);
    g.fillRect(0, 120, 1024, 8);
    g.font = 'italic 900 72px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffcc00';
    g.fillText(text, 512, 58);
    g.font = 'bold 22px Arial, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(sub, 512, 104);
  });
}

export function chevronTexture() {
  return canvasTexture(128, 96, (g) => {
    g.fillStyle = '#ffd200';
    g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#111';
    for (let k = 0; k < 2; k++) {
      const x = 22 + k * 46;
      g.beginPath();
      g.moveTo(x, 14);
      g.lineTo(x + 22, 14);
      g.lineTo(x + 50, 48);
      g.lineTo(x + 22, 82);
      g.lineTo(x, 82);
      g.lineTo(x + 28, 48);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#111';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 90);
  });
}

/** Kitchen floor: 2×2 checkered tiles with grout lines (repeat it with RepeatWrapping). */
export function floorTileTexture() {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#8f8579';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? '#2f3a44' : '#ebe4d6';
        g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
      }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function blobShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
