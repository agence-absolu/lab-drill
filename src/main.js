import './style.css';

import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

import { drillRoot, state, modelReady, resetDrag } from './scene.js';
import { POSES, focusVariant, responsive } from './poses.js';

gsap.registerPlugin(ScrollTrigger);

// --- Défilement lissé ---
// Lenis interpole la position de scroll ; ScrollTrigger doit donc lire cette
// position lissée plutôt que celle du navigateur, et Lenis avancer sur le
// ticker GSAP — deux boucles rAF concurrentes désynchroniseraient le foret du
// texte d'une frame. lagSmoothing(0) évite que GSAP « rattrape » un gros lag en
// sautant, ce qui produirait un à-coup dans la transition.
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis = null;

if (!REDUCED) {
  lenis = new Lenis({
    lerp: 0.1, // 0 = inerte, 1 = aucun lissage
    smoothWheel: true,
    syncTouch: false, // au doigt, on garde le défilement natif
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

const DEG = Math.PI / 180;
const IDENTITY = new THREE.Quaternion();

// Ordre d'apparition des poses dans la page.
const ORDER = ['hero', 'pointe', 'goujures', 'queue'];

// Amorti du scrub, en secondes de rattrapage. 0 ou true = rigoureusement collé
// au scroll ; une petite valeur lisse la molette sans désynchroniser.
const SCRUB = 0.5;

let currentId = 'hero';
let focused = false;
let timelines = [];
let sectionTriggers = [];

const dragQuat = resetDrag();

function poseFor(id) {
  return responsive(POSES[id], window.innerWidth);
}

// --- Transitions synchronisées au défilement ---
// Une timeline par passage d'une pose à la suivante, pilotée en scrub : la
// progression du foret EST la progression du scroll dans la zone de bascule.
// Celle-ci est centrée sur la frontière entre deux sections, de sorte qu'une
// section pleinement à l'écran corresponde toujours à une pose stable.
function buildTimelines() {
  for (const tl of timelines) {
    tl.scrollTrigger?.kill();
    tl.kill();
  }
  timelines = [];

  for (let i = 0; i < ORDER.length - 1; i++) {
    const next = document.querySelector(`[data-pose="${ORDER[i + 1]}"]`);
    if (!next) continue;

    const from = poseFor(ORDER[i]);
    const to = poseFor(ORDER[i + 1]);
    const first = i === 0;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: next,
        start: 'top 85%',
        end: 'top 35%',
        scrub: SCRUB,
        onUpdate: (self) => {
          // L'écart introduit à la souris se résorbe au fil du défilement.
          dragQuat.slerp(IDENTITY, 0.12);
          // La rotation propre ne tourne que sur le hero immobile : ailleurs
          // elle ferait dériver l'axe que la pose vient de choisir.
          if (first) state.spin = self.progress === 0;
        },
      },
      // Sans cela, chaque fromTo appliquerait son état de départ à la création
      // et la dernière timeline créée gagnerait, quelle que soit la position.
      defaults: { ease: 'none', immediateRender: false },
    });

    tl.fromTo(
      drillRoot.position,
      { x: from.pos[0], y: from.pos[1], z: from.pos[2] },
      { x: to.pos[0], y: to.pos[1], z: to.pos[2] },
      0
    )
      .fromTo(
        drillRoot.rotation,
        { x: from.rot[0] * DEG, y: from.rot[1] * DEG, z: from.rot[2] * DEG },
        { x: to.rot[0] * DEG, y: to.rot[1] * DEG, z: to.rot[2] * DEG },
        0
      )
      .fromTo(
        drillRoot.scale,
        { x: from.scale, y: from.scale, z: from.scale },
        { x: to.scale, y: to.scale, z: to.scale },
        0
      );

    timelines.push(tl);
  }
}

// --- Section active ---
// Sert au repérage (classe CSS, cible du bouton « détail ») ; le placement du
// foret, lui, est entièrement entre les mains du scrub ci-dessus.
function initSectionTriggers() {
  for (const t of sectionTriggers) t.kill();
  sectionTriggers = [];

  for (const el of document.querySelectorAll('[data-pose]')) {
    sectionTriggers.push(
      ScrollTrigger.create({
        trigger: el,
        start: 'top center',
        end: 'bottom center',
        onToggle: (self) => {
          if (!self.isActive) return;
          currentId = el.dataset.pose;
          focused = false;
          document.querySelectorAll('[data-pose]').forEach((s) => {
            s.classList.toggle('is-active', s === el);
          });
          document.querySelectorAll('[data-focus]').forEach((b) => {
            b.classList.remove('is-on');
          });
        },
      })
    );

    const panel = el.querySelector('.panel');
    if (!panel) continue;

    // Apparition confiée au CSS : un tween GSAP « from » se fait reverter par
    // les refresh de ScrollTrigger et reste figé à mi-course.
    sectionTriggers.push(
      ScrollTrigger.create({
        trigger: el,
        start: 'top 80%',
        once: true,
        onEnter: () => panel.classList.add('is-in'),
      })
    );
  }
}

// --- Pose ponctuelle ---
// Utilisée hors défilement : mise en place initiale et bouton « détail ».
// L'interpolation passe par un proxy plutôt que par des tweens visant
// directement drillRoot : un tween posé sur les mêmes propriétés écraserait
// (overwrite) les fromTo des timelines scrubées, qui ne rendraient plus rien.
const poseProxy = { t: 0 };

function writePose(pose) {
  drillRoot.position.set(...pose.pos);
  drillRoot.rotation.set(pose.rot[0] * DEG, pose.rot[1] * DEG, pose.rot[2] * DEG);
  drillRoot.scale.setScalar(pose.scale);
}

function applyPose(id, { focus = false, immediate = false } = {}) {
  const base = POSES[id];
  if (!base) return;

  const pose = responsive(focus ? focusVariant(base) : base, window.innerWidth);
  state.spin = Boolean(pose.spin);

  if (immediate) {
    writePose(pose);
    return;
  }

  const fromPos = drillRoot.position.clone();
  const fromRot = drillRoot.rotation.clone();
  const fromScale = drillRoot.scale.x;

  gsap.killTweensOf(poseProxy);
  poseProxy.t = 0;

  gsap.to(poseProxy, {
    t: 1,
    duration: 0.9,
    ease: 'power3.out',
    onUpdate: () => {
      const t = poseProxy.t;
      drillRoot.position.set(
        THREE.MathUtils.lerp(fromPos.x, pose.pos[0], t),
        THREE.MathUtils.lerp(fromPos.y, pose.pos[1], t),
        THREE.MathUtils.lerp(fromPos.z, pose.pos[2], t)
      );
      drillRoot.rotation.set(
        THREE.MathUtils.lerp(fromRot.x, pose.rot[0] * DEG, t),
        THREE.MathUtils.lerp(fromRot.y, pose.rot[1] * DEG, t),
        THREE.MathUtils.lerp(fromRot.z, pose.rot[2] * DEG, t)
      );
      drillRoot.scale.setScalar(THREE.MathUtils.lerp(fromScale, pose.scale, t));
    },
  });
}

// Les ancres du header doivent passer par Lenis, sinon le navigateur y saute
// sans lissage et ScrollTrigger reçoit un saut brut.
function initAnchors() {
  const header = document.querySelector('.site-header');
  const offset = header ? -header.offsetHeight : 0;

  for (const link of document.querySelectorAll('a[href^="#"]')) {
    const href = link.getAttribute('href');
    if (href.length < 2) continue;

    const target = document.querySelector(href);
    if (!target) continue;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset });
      else target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    });
  }
}

function initButtons() {
  for (const btn of document.querySelectorAll('[data-focus]')) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.focus;
      const next = !(focused && currentId === id);
      focused = next;
      currentId = id;
      applyPose(id, { focus: next });
      btn.classList.toggle('is-on', next);

      document.querySelectorAll('[data-focus]').forEach((other) => {
        if (other !== btn) other.classList.remove('is-on');
      });
    });
  }
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // Les bornes des fromTo sont figées à la construction : au changement de
    // format, les poses responsives changent, donc on reconstruit.
    buildTimelines();
    ScrollTrigger.refresh();
  }, 150);
});

// Le texte ne doit pas attendre le .glb : on câble le défilement tout de suite
// et on ne diffère que la mise en place de la pose initiale.
document.documentElement.classList.add('js-anim');
buildTimelines();
initSectionTriggers();
initAnchors();
initButtons();

modelReady.then(() => {
  if (window.scrollY < 4) applyPose('hero', { immediate: true });
  ScrollTrigger.refresh();
});

// Outil de réglage des poses, chargé uniquement à la demande (page#edit)
if (location.hash === '#edit') {
  import('./pose-editor.js').then((m) =>
    m.mount({ drillRoot, applyPose, getState: () => ({ id: currentId, focused }) })
  );
}
