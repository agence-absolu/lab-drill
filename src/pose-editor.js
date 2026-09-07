// Outil de réglage des poses — chargé uniquement si l'URL se termine par #edit.
//
// Il ne sert qu'au réglage : on attrape le foret à la souris et/ou on pousse les
// curseurs jusqu'au cadrage voulu, puis « Copier » met le bloc JSON dans le
// presse-papier, prêt à être collé dans src/poses.js. Rien de tout ceci n'est
// embarqué dans le bundle de production (import dynamique).

import ScrollTrigger from 'gsap/ScrollTrigger';

const DEG = 180 / Math.PI;

const FIELDS = [
  { key: 'px', label: 'pos X', min: -4, max: 4, step: 0.01 },
  { key: 'py', label: 'pos Y', min: -5, max: 5, step: 0.01 },
  { key: 'pz', label: 'pos Z', min: -3, max: 2, step: 0.01 },
  { key: 'rx', label: 'rot X', min: -180, max: 180, step: 1 },
  { key: 'ry', label: 'rot Y', min: -180, max: 360, step: 1 },
  { key: 'rz', label: 'rot Z', min: -180, max: 180, step: 1 },
  { key: 'sc', label: 'échelle', min: 0.2, max: 6, step: 0.01 },
];

export function mount({ drillRoot, getState }) {
  const el = document.createElement('aside');
  el.className = 'pose-editor';
  el.innerHTML = `
    <header>
      <strong>Poses</strong>
      <span class="pose-editor-id">—</span>
    </header>
    <label class="pose-editor-lock">
      <input type="checkbox" /> figer (ignorer le défilement)
    </label>
    <div class="pose-editor-rows"></div>
    <button type="button" class="pose-editor-copy">Copier le JSON</button>
    <pre class="pose-editor-out"></pre>
  `;
  document.body.appendChild(el);

  const rows = el.querySelector('.pose-editor-rows');
  const out = el.querySelector('.pose-editor-out');
  const idEl = el.querySelector('.pose-editor-id');
  const lock = el.querySelector('.pose-editor-lock input');
  const inputs = {};
  let editing = false;

  for (const f of FIELDS) {
    const row = document.createElement('label');
    row.className = 'pose-editor-row';
    row.innerHTML = `
      <span>${f.label}</span>
      <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" />
      <input type="number" min="${f.min}" max="${f.max}" step="${f.step}" />
    `;
    const [range, number] = row.querySelectorAll('input');
    inputs[f.key] = { range, number };

    const push = (value) => {
      range.value = value;
      number.value = value;
      write();
    };

    range.addEventListener('pointerdown', () => (editing = true));
    range.addEventListener('pointerup', () => (editing = false));
    range.addEventListener('input', () => push(range.value));
    number.addEventListener('focus', () => (editing = true));
    number.addEventListener('blur', () => (editing = false));
    number.addEventListener('input', () => push(number.value));

    rows.appendChild(row);
  }

  function write() {
    const v = (k) => parseFloat(inputs[k].range.value);
    drillRoot.position.set(v('px'), v('py'), v('pz'));
    drillRoot.rotation.set(v('rx') / DEG, v('ry') / DEG, v('rz') / DEG);
    drillRoot.scale.setScalar(v('sc'));
    render();
  }

  function read() {
    const set = (k, value) => {
      const n = Number(value.toFixed(k === 'sc' || k[0] === 'p' ? 2 : 0));
      inputs[k].range.value = n;
      inputs[k].number.value = n;
    };
    set('px', drillRoot.position.x);
    set('py', drillRoot.position.y);
    set('pz', drillRoot.position.z);
    set('rx', drillRoot.rotation.x * DEG);
    set('ry', drillRoot.rotation.y * DEG);
    set('rz', drillRoot.rotation.z * DEG);
    set('sc', drillRoot.scale.x);
    render();
  }

  function snapshot() {
    const v = (k) => parseFloat(inputs[k].range.value);
    return {
      pos: [v('px'), v('py'), v('pz')],
      rot: [v('rx'), v('ry'), v('rz')],
      scale: v('sc'),
    };
  }

  function render() {
    const { id } = getState();
    const p = snapshot();
    idEl.textContent = id;
    out.textContent = `${id}: {\n  pos: [${p.pos.join(', ')}],\n  rot: [${p.rot.join(
      ', '
    )}],\n  scale: ${p.scale},\n},`;
  }

  el.querySelector('.pose-editor-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(out.textContent);
    const btn = el.querySelector('.pose-editor-copy');
    btn.textContent = 'Copié !';
    setTimeout(() => (btn.textContent = 'Copier le JSON'), 1200);
  });

  lock.addEventListener('change', () => {
    for (const t of ScrollTrigger.getAll()) {
      if (lock.checked) t.disable(false);
      else t.enable();
    }
  });

  // Les curseurs suivent le foret (drag souris, transitions de pose) tant qu'on
  // ne les manipule pas soi-même.
  (function follow() {
    if (!editing) read();
    requestAnimationFrame(follow);
  })();

  console.info('[poses] éditeur actif — retirer #edit de l\'URL pour le masquer');
}
