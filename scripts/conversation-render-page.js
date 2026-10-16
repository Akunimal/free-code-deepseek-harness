// Browser fixture bootstrap appended to the unchanged production bundle regions.
// Reproducible visual fixtures; production randomness is unchanged.
let seed = 0x0f094;
Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
window.addEventListener('error', e => errors.push(e.message));
const draws = new WeakMap();
const textDraws = new WeakMap();
for (const name of ['clearRect', 'fillRect']) {
  const original = CanvasRenderingContext2D.prototype[name];
  CanvasRenderingContext2D.prototype[name] = function (...args) {
    if (name === 'clearRect' || this.globalCompositeOperation === 'destination-out') {
      draws.set(this.canvas, (draws.get(this.canvas) || 0) + 1);
    }
    return original.apply(this, args);
  };
}
const originalFillText = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (...args) {
  textDraws.set(this.canvas, (textDraws.get(this.canvas) || 0) + 1);
  return originalFillText.apply(this, args);
};
const app = createRoot(document.getElementById('app'));
let clicks = 0;
function renderPanel(running) {
  app.render(react_jsx_runtime.jsx(ConversationMainPanel, {
    sessionId: 'proof',
    useSession: select => select({ running, blank: false, openState: 'open' }),
    useConversation: select => select({ activeTargets: new Set(['retained-history']) }),
    useSessions: select => select({ byId: { proof: { blank: false } } }),
    renderSlot: () => react_jsx_runtime.jsx('header', { children: 'FreeCode — Hermes Phoenix · ' + (running ? 'Trabajando / Working' : 'En reposo / Idle') }),
    renderFactorySlot: () => react_jsx_runtime.jsxs('section', { className: 'fixture-content', children: [
      react_jsx_runtime.jsx('div', { className: 'fixture-bubble', children: 'Panel y patrones del bundle real de producción. Nueve efectos de Hermes; cambian y aceleran durante una tarea. No es la vista previa del gradiente anterior.' }),
      react_jsx_runtime.jsx('button', { onClick: () => clicks++, children: 'Composer — comprobar interacción' }),
    ] }),
  }));
}
function sample() {
  const host = document.querySelector('[data-phoenix-background]');
  const layers = Array.from(host?.querySelectorAll('[data-phoenix-layer]') || []).map(layer => {
    const canvas = layer.querySelector('canvas');
    let colored = 0, hash = 2166136261;
    if (canvas) {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < data.length; i++) {
        if (i % 4 === 3 && data[i]) colored++;
        hash = Math.imul(hash ^ data[i], 16777619);
      }
    }
    return {
      pattern: layer.dataset.phoenixLayer,
      opacity: Number(getComputedStyle(layer).opacity),
      draws: canvas ? draws.get(canvas) || 0 : 0,
      textDraws: canvas ? textDraws.get(canvas) || 0 : 0,
      colored, hash, width: canvas?.width, height: canvas?.height,
    };
  });
  const current = layers.at(-1);
  return { ...host?.dataset, canvases: host?.querySelectorAll('canvas').length ?? 0, layers,
    draws: current?.draws || 0, colored: current?.colored || 0, hash: current?.hash,
    width: current?.width, height: current?.height };
}
window.freecodeProof = { renderPanel, sample, errors, async gallery() {
  app.unmount();
  const gallery = document.createElement('div'); gallery.className = 'gallery'; document.body.append(gallery);
  const cleanups = PHOENIX_PATTERNS.map(pattern => {
    const tile = document.createElement('div'); tile.className = 'tile'; tile.dataset.working = 'true';
    const label = document.createElement('label'); label.textContent = pattern; tile.append(label); gallery.append(tile);
    return { pattern, tile, stop: startPhoenixPattern(pattern, tile) };
  });
  const hash = canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let value = 2166136261;
    for (let i = 0; i < data.length; i++) value = Math.imul(value ^ data[i], 16777619);
    return value;
  };
  await wait(150);
  const before = new Map(cleanups.map(({ pattern, tile }) => [pattern, hash(tile.querySelector('canvas'))]));
  await wait(1200);
  const proof = cleanups.map(({ pattern, tile }) => {
    const canvas = tile.querySelector('canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) colored++;
    return { pattern, colored, before: before.get(pattern), after: hash(canvas),
      textDraws: textDraws.get(canvas) || 0 };
  });
  return { proof, stop: () => { cleanups.forEach(({ stop }) => stop()); gallery.remove(); } };
} };
(async () => {
  renderPanel(false); await wait(1000); const idle = sample();
  renderPanel(true); await wait(250); const workingStart = sample();
  await wait(1000); const workingEnd = sample();
  renderPanel(false); await wait(250); const finishStart = sample();
  await wait(1000); const finished = sample();
  document.querySelector('button').click();
  const button = document.querySelector('button'), rect = button.getBoundingClientRect();
  const hitTarget = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button;
  document.documentElement.setAttribute('data-render-proof', btoa(JSON.stringify({
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    idle, workingStart, workingEnd, finishStart, finished, clicks, hitTarget, errors,
  })));
})();
