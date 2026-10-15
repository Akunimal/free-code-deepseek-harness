/*!
MIT License

Copyright (c) 2026 github.com/fathah

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Adapted from Hermes Phoenix patterns; FreeCode adds bounded activity timing.
*/
/**
 * Phoenix animated background patterns (fork feature).
 *
 * Canvas particle effects ported from PhoenixPowerCoder's theme.js.
 * Each pattern mounts a canvas into a host element and returns a cleanup
 * function that cancels the RAF loop, detaches listeners, and removes the
 * canvas. Colors resolve from CSS vars each frame so theme switches apply
 * live: --phx-effect-color overrides, falling back to --accent.
 */

type Cleanup = () => void;

export const PHOENIX_PATTERNS = [
  "synapse",
  "rain",
  "constellations",
  "sparkles",
  "perlin-flow",
  "petals",
  "embers",
  "bubbles",
  "squares",
] as const;

export type PhoenixPattern = (typeof PHOENIX_PATTERNS)[number];

let _lastPattern: string = "";

/** Random pattern, never the same twice in a row (mirrors PPC behavior). */
export function pickPhoenixPattern(): PhoenixPattern {
  const pool = PHOENIX_PATTERNS.filter((p) => p !== _lastPattern);
  const p = pool[Math.floor(Math.random() * pool.length)];
  _lastPattern = p;
  return p;
}

function cssColor(): string {
  const s = getComputedStyle(document.documentElement);
  return (
    s.getPropertyValue("--phx-effect-color").trim() ||
    s.getPropertyValue("--accent").trim() ||
    "#9cdef2"
  );
}

/** Parse #rgb / #rrggbb / rgb(a)() into components; null when unparseable. */
function parseColor(c: string): { r: number; g: number; b: number } | null {
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgb = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  return null;
}

function rgba(c: string, a: number): string {
  const p = parseColor(c) || { r: 156, g: 222, b: 242 };
  return `rgba(${p.r},${p.g},${p.b},${a})`;
}

interface Frame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stop: () => boolean;
  size: () => { W: number; H: number };
}

/**
 * Shared canvas scaffold: mount, DPR scaling, resize listener, RAF loop with
 * stop flag. `draw` runs once per frame after the canvas is ready.
 */
function mountCanvas(
  host: HTMLElement,
  draw: (f: Frame) => void,
  onResize?: () => void,
): Cleanup {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return () => {};
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let W = 0;
  let H = 0;
  let stopped = false;
  let raf = 0;

  function resize(): void {
    W = host.clientWidth;
    H = host.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize?.();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const frame: Frame = {
    canvas,
    ctx,
    stop: () => stopped,
    size: () => ({ W, H }),
  };

  const clock = createPhoenixClock()
  // Seed particles so entering a view never waits on a probabilistic spawn.
  for (let i = 0; i < 24; i++) draw(frame)
  function loop(now: number): void {
    if (stopped) return
    const steps = clock(now, host.dataset.working === 'true')
    for (let i = 0; i < steps; i++) draw(frame)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  return () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    ro.disconnect()
    canvas.remove()
  };
}

// ── Synapse — light pulses racing along grid lines ──
function startSynapse(host: HTMLElement): Cleanup {
  const GRID = 24;
  const MAX_PULSES = 20;
  const TRAIL = 12;
  type Pulse = { x: number; y: number; dx: number; dy: number };
  let pulses: Pulse[] = [];
  return mountCanvas(host, ({ ctx, size }) => {
    const { W, H } = size();
    ctx.clearRect(0, 0, W, H);
    const c = cssColor();
    const cols = Math.ceil(W / GRID);
    const rows = Math.ceil(H / GRID);
    if (pulses.length < MAX_PULSES && Math.random() < 0.12) {
      const speed = 2 + Math.random() * 20;
      if (Math.random() > 0.5) {
        pulses.push({ x: -TRAIL, y: Math.floor(Math.random() * (rows + 1)) * GRID, dx: speed, dy: 0 });
      } else {
        pulses.push({ x: Math.floor(Math.random() * (cols + 1)) * GRID, y: -TRAIL, dx: 0, dy: speed });
      }
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.x += p.dx;
      p.y += p.dy;
      if (p.x > W + TRAIL || p.y > H + TRAIL) {
        pulses.splice(i, 1);
        continue;
      }
      const tx = p.x - (p.dx > 0 ? TRAIL : 0);
      const ty = p.y - (p.dy > 0 ? TRAIL : 0);
      const grad = ctx.createLinearGradient(tx, ty, p.x, p.y);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(1, c);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

// ── Rain — thin vertical streaks falling ──
function startRain(host: HTMLElement): Cleanup {
  type Drop = { x: number; y: number; len: number; speed: number; alpha: number };
  const drops: Drop[] = [];
  const MAX_DROPS = 130;
  return mountCanvas(host, ({ ctx, size }) => {
    const { W, H } = size();
    ctx.clearRect(0, 0, W, H);
    const c = cssColor();
    if (drops.length < MAX_DROPS && Math.random() < 0.6) {
      const len = 20 + Math.random() * 40;
      drops.push({ x: Math.random() * W, y: -len, len, speed: 4 + Math.random() * 8, alpha: 0.32 + Math.random() * 0.28 });
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += d.speed;
      if (d.y > H + d.len) {
        drops.splice(i, 1);
        continue;
      }
      const grad = ctx.createLinearGradient(d.x, d.y - d.len, d.x, d.y);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(1, c);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = d.alpha;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - d.len);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

// ── Constellations — drifting stars with proximity lines ──
function startConstellations(host: HTMLElement): Cleanup {
  const STAR_COUNT = 50;
  const CONNECT = 120;
  type Star = { x: number; y: number; vx: number; vy: number; r: number; phase: number };
  let stars: Star[] = [];
  let t = 0;
  const init = (W: number, H: number): void => {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: 0.8 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
  };
  return mountCanvas(host, ({ ctx, size }) => {
    const { W, H } = size();
    if (stars.length === 0) init(W, H);
    t += 0.01;
    ctx.clearRect(0, 0, W, H);
    const c = cssColor();
    for (const s of stars) {
      s.x += s.vx;
      s.y += s.vy;
      if (s.x < 0) s.x = W;
      if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H;
      if (s.y > H) s.y = 0;
    }
    ctx.strokeStyle = c;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x;
        const dy = stars[i].y - stars[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECT) {
          ctx.globalAlpha = (1 - dist / CONNECT) * 0.15;
          ctx.beginPath();
          ctx.moveTo(stars[i].x, stars[i].y);
          ctx.lineTo(stars[j].x, stars[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = c;
    for (const s of stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * 2 + s.phase);
      ctx.globalAlpha = 0.15 + twinkle * 0.25;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

// ── Perlin noise helpers ──
function noise2d(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = noise2d(ix, iy);
  const b = noise2d(ix + 1, iy);
  const cc = noise2d(ix, iy + 1);
  const d = noise2d(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (cc - a) * uy + (a - b - cc + d) * ux * uy;
}

// ── Perlin Flow — particle streams following a noise field ──
function startPerlinFlow(host: HTMLElement): Cleanup {
  type P = { x: number; y: number; life: number };
  const particles: P[] = [];
  let t = 0;
  return mountCanvas(host, ({ ctx, size }) => {
    const { W, H } = size();
    if (particles.length === 0) {
      for (let i = 0; i < 200; i++) particles.push({ x: Math.random() * W, y: Math.random() * H, life: Math.random() });
    }
    // Trail fade without painting an opaque background: erode previous frame.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.04)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    const c = cssColor();
    for (const p of particles) {
      const n = smoothNoise(p.x * 0.004 + t * 0.0008, p.y * 0.004 + 100);
      const angle = n * Math.PI * 6;
      const speed = 1 + smoothNoise(p.x * 0.003, p.y * 0.003 + 50) * 1.5;
      p.x += Math.cos(angle) * speed;
      p.y += Math.sin(angle) * speed;
      p.life -= 0.001;
      if (p.life <= 0 || p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
        p.x = Math.random() * W;
        p.y = Math.random() * H;
        p.life = 1;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.globalAlpha = p.life * 0.15;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    t++;
  });
}

// ── Petals — gentle falling flower petals ──
function startPetals(host: HTMLElement): Cleanup {
  type Petal = {
    x: number; y: number; size: number; rot: number; vr: number; vy: number;
    drift: number; driftSpeed: number; wobble: number;
  };
  const petals: Petal[] = [];
  const make = (W: number): Petal => ({
    x: Math.random() * W,
    y: -10 - Math.random() * 40,
    size: 3 + Math.random() * 5,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.03,
    vy: 0.3 + Math.random() * 0.6,
    drift: Math.random() * Math.PI * 2,
    driftSpeed: 0.008 + Math.random() * 0.012,
    wobble: 0.3 + Math.random() * 0.8,
  });
  return mountCanvas(host, ({ ctx, size }) => {
    const { W, H } = size();
    if (petals.length === 0) {
      for (let i = 0; i < 30; i++) {
        const p = make(W);
        p.y = Math.random() * H;
        petals.push(p);
      }
    }
    ctx.clearRect(0, 0, W, H);
    const c = cssColor();
    for (const p of petals) {
      p.y += p.vy;
      p.rot += p.vr;
      p.drift += p.driftSpeed;
      p.x += Math.sin(p.drift) * p.wobble;
      if (p.y > H + 15) Object.assign(p, make(W));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(-p.size * 0.2, 0, p.size * 0.6, p.size * 0.3, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.ellipse(p.size * 0.2, 0, p.size * 0.6, p.size * 0.3, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  });
}

// ── Sparkles — twinkling 4-point stars ──
function startSparkles(host: HTMLElement): Cleanup {
  type Spark = { x: number; y: number; size: number; phase: number; speed: number; life: number };
  const sparkles: Spark[] = [];
  const make = (W: number, H: number): Spark => ({
    x: Math.random() * W,
    y: Math.random() * H,
    size: 2 + Math.random() * 5,
    phase: Math.random() * Math.PI * 2,
    speed: 0.015 + Math.random() * 0.03,
    life: 0.5 + Math.random() * 0.5,
  });
  return mountCanvas(host, ({ ctx, size }) => {
    const { W, H } = size();
    if (sparkles.length === 0) for (let i = 0; i < 35; i++) sparkles.push(make(W, H));
    ctx.clearRect(0, 0, W, H);
    const c = cssColor();
    for (const s of sparkles) {
      s.phase += s.speed;
      const twinkle = Math.sin(s.phase);
      const alpha = Math.max(0, twinkle) * 0.25 * s.life;
      const r = s.size * (0.5 + Math.max(0, twinkle) * 0.5);
      if (alpha > 0.01) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.fillStyle = c;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(r * 0.15, -r * 0.15, r, 0);
        ctx.quadraticCurveTo(r * 0.15, r * 0.15, 0, r);
        ctx.quadraticCurveTo(-r * 0.15, r * 0.15, -r, 0);
        ctx.quadraticCurveTo(-r * 0.15, -r * 0.15, 0, -r);
        ctx.fill();
        ctx.restore();
      }
      if (s.phase > Math.PI * 6) Object.assign(s, make(W, H));
    }
    ctx.globalAlpha = 1;
  });
}

// ── Embers — warm glowing particles rising with spark bursts ──
function startEmbers(host: HTMLElement): Cleanup {
  type Ember = {
    x: number; y: number; vx: number; vy: number; r: number;
    life: number; maxLife: number; wobble: number; spark: boolean;
  };
  const embers: Ember[] = [];
  const make = (W: number, H: number): Ember => ({
    x: Math.random() * W,
    y: H + Math.random() * 40,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -0.3 - Math.random() * 0.8,
    r: 0.3 + Math.random() * 0.6,
    life: 0,
    maxLife: 220 + Math.random() * 220,
    wobble: Math.random() * Math.PI * 2,
    spark: false,
  });
  return mountCanvas(host, ({ ctx, size }) => {
    const { W, H } = size();
    if (embers.length === 0) {
      for (let i = 0; i < 60; i++) {
        const e = make(W, H);
        e.y = Math.random() * H;
        e.life = Math.random() * e.maxLife;
        embers.push(e);
      }
    }
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const color = cssColor();
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.wobble += 0.03;
      e.x += e.vx + Math.sin(e.wobble) * 0.5;
      e.y += e.vy;
      e.life++;
      if (e.life > e.maxLife || e.y < -20) {
        embers.splice(i, 1);
        if (embers.length < 70) embers.push(make(W, H));
        continue;
      }
      if (!e.spark && Math.random() < 0.003) e.spark = true;
      const lifeRatio = e.life / e.maxLife;
      const fade = Math.min(1, Math.min(lifeRatio * 4, (1 - lifeRatio) * 3));
      const r = e.r * (e.spark ? 2.4 : 1);
      const a = (e.spark ? 0.9 : 0.55) * fade;
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 4);
      g.addColorStop(0, rgba(color, a));
      g.addColorStop(0.4, rgba(color, a * 0.3));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(e.x - r * 4, e.y - r * 4, r * 8, r * 8);
      ctx.fillStyle = rgba("#ffffff", a * 0.6);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      e.spark = false;
    }
    if (Math.random() < 0.015) {
      const bx = Math.random() * W;
      for (let i = 0; i < 5; i++) {
        const e = make(W, H);
        e.x = bx + (Math.random() - 0.5) * 40;
        e.y = H - 10;
        e.vy *= 1.5;
        embers.push(e);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  });
}

// ── Bubbles — translucent circles drifting upward ──
function startBubbles(host: HTMLElement): Cleanup {
  type Bubble = {
    x: number; y: number; r: number; vy: number;
    drift: number; wobble: number; alpha: number;
  };
  const bubbles: Bubble[] = [];
  const make = (W: number, H: number, initial: boolean): Bubble => {
    const r = 8 + Math.random() * 42;
    return {
      x: Math.random() * W,
      y: initial ? Math.random() * H : H + r + Math.random() * 60,
      r,
      vy: -(0.25 + Math.random() * 0.75) * (r / 30),
      drift: (Math.random() - 0.5) * 0.4,
      wobble: Math.random() * Math.PI * 2,
      alpha: 0.06 + Math.random() * 0.14,
    };
  };
  return mountCanvas(host, ({ ctx, size }) => {
    const { W, H } = size();
    if (bubbles.length === 0) for (let i = 0; i < 22; i++) bubbles.push(make(W, H, true));
    ctx.clearRect(0, 0, W, H);
    const c = cssColor();
    for (const b of bubbles) {
      b.wobble += 0.02;
      b.y += b.vy;
      b.x += b.drift + Math.sin(b.wobble) * 0.3;
      ctx.globalAlpha = b.alpha;
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = b.alpha * 0.35;
      ctx.fillStyle = c;
      ctx.fill();
      if (b.y < -b.r * 2) Object.assign(b, make(W, H, false));
    }
    ctx.globalAlpha = 1;
  });
}

// ── Squares — rotating squares floating upward ──
function startSquares(host: HTMLElement): Cleanup {
  type Square = {
    x: number; y: number; s: number; vy: number;
    rot: number; vr: number; alpha: number; fill: boolean;
  };
  const squares: Square[] = [];
  const make = (W: number, H: number, initial: boolean): Square => {
    const s = 10 + Math.random() * 50;
    return {
      x: Math.random() * W,
      y: initial ? Math.random() * H : H + s + Math.random() * 80,
      s,
      vy: -(0.2 + Math.random() * 0.6),
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.02,
      alpha: 0.05 + Math.random() * 0.12,
      fill: Math.random() < 0.35,
    };
  };
  return mountCanvas(host, ({ ctx, size }) => {
    const { W, H } = size();
    if (squares.length === 0) for (let i = 0; i < 18; i++) squares.push(make(W, H, true));
    ctx.clearRect(0, 0, W, H);
    const c = cssColor();
    for (const q of squares) {
      q.y += q.vy;
      q.rot += q.vr;
      const half = q.s / 2;
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.globalAlpha = q.alpha;
      if (q.fill) {
        ctx.fillStyle = c;
        ctx.fillRect(-half, -half, half * 2, half * 2);
      } else {
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-half, -half, half * 2, half * 2);
      }
      ctx.restore();
      if (q.y < -q.s * 2) Object.assign(q, make(W, H, false));
    }
    ctx.globalAlpha = 1;
  });
}

const STARTERS: Record<PhoenixPattern, (host: HTMLElement) => Cleanup> = {
  synapse: startSynapse,
  rain: startRain,
  constellations: startConstellations,
  sparkles: startSparkles,
  "perlin-flow": startPerlinFlow,
  petals: startPetals,
  embers: startEmbers,
  bubbles: startBubbles,
  squares: startSquares,
};

/** Start a pattern inside `host` (must be position:relative). */
export function startPhoenixPattern(
  pattern: PhoenixPattern,
  host: HTMLElement,
): Cleanup {
  return STARTERS[pattern](host);
}

/** Fixed virtual frames: refresh-rate independent, no unbounded catch-up. */
export function createPhoenixClock(): (now: number, working: boolean) => number {
  let last: number | undefined
  let debt = 0
  return (now, working) => {
    if (last === undefined) { last = now; return 0 }
    const elapsed = Math.min(100, Math.max(0, now - last))
    last = now
    debt += elapsed / (1000 / 60) * (working ? 1.2 : 0.3)
    const steps = Math.min(4, Math.floor(debt))
    debt = Math.min(1, debt - steps)
    return steps
  }
}
