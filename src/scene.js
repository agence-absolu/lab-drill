import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

import drillUrl from '../models/drill-01.glb?url';

const container = document.getElementById('canvas-root');
const loaderEl = document.getElementById('loader');

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const canvas = renderer.domElement;
const scene = new THREE.Scene();

// --- Environnement ---
// Le métal ne montre que ce qu'il reflète. On part d'un studio clair
// (RoomEnvironment) dans lequel on plante des panneaux noirs façon « negative
// fill » : ils n'existent que dans l'environnement réfléchi, jamais dans la
// scène rendue, donc ils sont invisibles à la caméra mais creusent des bandes
// sombres dans les reflets, ce qui détache les arêtes et l'hélice du foret.
const BLACK_PANELS = [
  { size: [3.5, 7], pos: [0, 0, 3.4] },    // face
  { size: [3, 7], pos: [-3.6, 0, -1.4] },  // arrière gauche
  { size: [2.5, 7], pos: [3.4, 0, -2.2] }, // arrière droit
  { size: [2, 6], pos: [1.6, 0.4, 3.0] },  // bande fine, côté caméra
];

const SHOW_PANELS = false; // true = matérialise les panneaux pour les régler

const envScene = new RoomEnvironment();
const panelMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  side: THREE.DoubleSide,
});

for (const p of BLACK_PANELS) {
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(...p.size), panelMaterial);
  panel.position.set(...p.pos);
  panel.lookAt(0, 0, 0);
  envScene.add(panel);

  if (SHOW_PANELS) {
    const ghost = panel.clone();
    ghost.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    scene.add(ghost);
  }
}

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0.05).texture;

// --- Caméra ---
// Frontale et définitivement figée : c'est le foret qui se déplace dans la
// scène, ce qui garde l'éclairage identique quelle que soit la section.
const CAMERA_Z = 3.4;
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, CAMERA_Z);
camera.lookAt(0, 0, 0);

// --- Lumières ---
// Éclairage type studio : le métal ne « brille » que s'il a quelque chose à
// refléter, d'où les RectAreaLight (bandes verticales = reflets allongés sur le
// cylindre du foret) en plus des lumières directes.
RectAreaLightUniformsLib.init();

const hemi = new THREE.HemisphereLight(0xdce8ff, 0x35302a, 0.4);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 1.8);
key.position.set(3, 5, 2.5);
scene.add(key);

const fill = new THREE.DirectionalLight(0xbfd4ff, 0.7);
fill.position.set(-4, 2, -3);
scene.add(fill);

const rim = new THREE.SpotLight(0xfff4e0, 14, 20, Math.PI / 5, 0.6, 1.5);
rim.position.set(-1.8, 3.5, -3.5);
scene.add(rim);

const stripes = [
  { color: 0xffffff, intensity: 4.5, w: 0.7, h: 4, pos: [2.4, 0.6, 1.8] },
  { color: 0xd8e6ff, intensity: 3, w: 0.5, h: 4, pos: [-2.6, 0.2, 1.2] },
  { color: 0xfff0d6, intensity: 3.5, w: 0.6, h: 4, pos: [-0.6, 0.8, -2.8] },
];

for (const s of stripes) {
  const light = new THREE.RectAreaLight(s.color, s.intensity, s.w, s.h);
  light.position.set(...s.pos);
  light.lookAt(0, 0, 0);
  scene.add(light);
}

// --- Réticule de visée ---
// Cercle d'interface posé sur une zone du foret : il vit dans la scène (pas
// dans le modèle) pour garder une taille constante quelle que soit l'échelle de
// la pose, et se rend sans test de profondeur pour rester lisible par-dessus
// l'acier, comme un élément d'UI.
const RETICLE = {
  radius: 0.36, // unités de scène
  thickness: 1.5, // pixels
  hookGap: 7, // pixels entre le cercle et les crochets
  spin: 0.18, // rad/s — seuls les crochets rendent la rotation perceptible
  color: 0xd98b3f,
};

// Halo : quelques anneaux larges et très transparents en fusion additive,
// empilés sous le trait. Un vrai bloom demanderait une passe de
// post-traitement sur toute la scène pour un effet qui ne concerne que ce
// cercle.
const HALO_LAYERS = [
  { width: 5, alpha: 0.1 },
  { width: 13, alpha: 0.05 },
  { width: 28, alpha: 0.025 },
];

const haloMaterials = [];

const reticleMaterial = new THREE.MeshBasicMaterial({
  color: RETICLE.color,
  depthTest: false,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
});

const reticleGroup = new THREE.Group();
reticleGroup.visible = false;
reticleGroup.renderOrder = 999;
scene.add(reticleGroup);

// Épaisseur donnée en pixels : on la convertit en unités de scène, ce qui
// suppose de reconstruire la géométrie quand la hauteur du viewport change.
function unitsPerPixel() {
  const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * CAMERA_Z;
  return visibleHeight / window.innerHeight;
}

function buildReticle() {
  for (const child of [...reticleGroup.children]) {
    child.geometry.dispose();
    if (child.material !== reticleMaterial) child.material.dispose();
    reticleGroup.remove(child);
  }
  haloMaterials.length = 0;

  const u = unitsPerPixel();
  const t = RETICLE.thickness * u;
  const gap = RETICLE.hookGap * u;
  const r = RETICLE.radius;

  // Le halo est ajouté en premier : il se rend donc sous le trait net.
  for (const layer of HALO_LAYERS) {
    const w = layer.width * u;
    const material = new THREE.MeshBasicMaterial({
      color: RETICLE.color,
      depthTest: false,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    material.userData.alpha = layer.alpha;
    haloMaterials.push(material);

    reticleGroup.add(
      new THREE.Mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 160), material)
    );
  }

  // Beaucoup de segments : sur un trait aussi fin, un cercle facetté se voit.
  reticleGroup.add(
    new THREE.Mesh(new THREE.RingGeometry(r - t / 2, r + t / 2, 160), reticleMaterial)
  );

  // Quatre crochets en diagonale : c'est ce qui fait lire le cercle comme un
  // viseur plutôt que comme un simple contour. L'écart est exprimé en pixels,
  // indépendamment de l'épaisseur, pour ne pas bouger si le trait s'affine.
  for (let i = 0; i < 4; i++) {
    const start = Math.PI / 4 + (i * Math.PI) / 2 - 0.17;
    reticleGroup.add(
      new THREE.Mesh(
        new THREE.RingGeometry(r + gap, r + gap + t, 16, 1, start, 0.34),
        reticleMaterial
      )
    );
  }
}

buildReticle();

let reticleY = 0;
let reticleAngle = 0;
const reticlePoint = new THREE.Vector3();

export const focusRing = {
  group: reticleGroup,
  material: reticleMaterial,
  // y exprimé dans le repère du foret : -0,8 (bout de la queue) à +0,8 (pointe)
  setTarget(y) {
    reticleY = y;
  },
};

// --- Hiérarchie du foret ---
// drillRoot  : la pose (position / rotation / échelle), animée par GSAP
//   dragGroup : l'écart introduit à la souris, ramené à zéro à chaque pose
//     spinGroup : la rotation propre, lente et continue
//       pivot   : normalisation du .glb (recentrage + mise à l'échelle)
export const drillRoot = new THREE.Group();
const dragGroup = new THREE.Group();
const spinGroup = new THREE.Group();

drillRoot.add(dragGroup);
dragGroup.add(spinGroup);
scene.add(drillRoot);

export const state = { spin: true };

// --- Modèle ---
const UPRIGHT = true;
const TARGET_HEIGHT = 1.6; // hauteur du foret en unités de scène
const SPIN_SPEED = 0.25; // rad/s

// Acier poli : le .glb ne porte aucune texture, on règle donc le PBR à la main.
const STEEL = {
  color: 0x8d9298,
  metalness: 0.95,
  roughness: 0.34,
  envMapIntensity: 1.1,
};

let loaded = false;

export const modelReady = new Promise((resolve, reject) => {
  new GLTFLoader().load(
    drillUrl,
    (gltf) => {
      const model = gltf.scene;

      model.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        m.color.setHex(STEEL.color);
        m.metalness = STEEL.metalness;
        m.roughness = STEEL.roughness;
        m.envMapIntensity = STEEL.envMapIntensity;
        m.needsUpdate = true;
      });

      if (UPRIGHT) {
        const raw = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        if (raw.x > raw.y && raw.x >= raw.z) model.rotation.z = -Math.PI / 2;
        else if (raw.z > raw.y) model.rotation.x = Math.PI / 2;
      }

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const pivot = new THREE.Group();
      model.position.sub(center);
      pivot.add(model);
      pivot.scale.setScalar(TARGET_HEIGHT / Math.max(size.x, size.y, size.z));
      spinGroup.add(pivot);

      loaded = true;
      loaderEl?.classList.add('hidden');
      resolve(pivot);
    },
    undefined,
    (err) => {
      console.error(err);
      if (loaderEl) loaderEl.textContent = 'Erreur de chargement du modèle';
      reject(err);
    }
  );
});

// --- Drag ---
// Écart libre par rapport à la pose courante, uniquement à la souris : au doigt
// on laisse le geste au défilement de la page.
const DRAG_SPEED = 0.006; // rad par pixel
const DRAG_INERTIA = 0.93; // 0 = arrêt net, 0.97 = glisse longtemps

let dragging = false;
let lastX = 0;
let lastY = 0;
let dragAngle = 0; // vitesse résiduelle, entretenue par l'inertie
const dragAxis = new THREE.Vector3(0, 1, 0);
const dragQuat = new THREE.Quaternion();
const viewAxis = new THREE.Vector3();

function applyDrag() {
  dragQuat.setFromAxisAngle(dragAxis, dragAngle);
  dragGroup.quaternion.premultiply(dragQuat);
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') return;
  dragging = true;
  dragAngle = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (!dx && !dy) return;

  if (e.shiftKey) {
    // Shift = roll autour de l'axe de vue
    camera.getWorldDirection(viewAxis);
    dragAxis.copy(viewAxis);
    dragAngle = -dx * DRAG_SPEED;
  } else {
    // Axe perpendiculaire au geste, exprimé dans le repère de la caméra :
    // l'objet suit la souris quelle que soit son orientation courante.
    dragAxis.set(dy, dx, 0).normalize().applyQuaternion(camera.quaternion);
    dragAngle = Math.hypot(dx, dy) * DRAG_SPEED;
  }

  applyDrag();
});

function endDrag() {
  dragging = false;
  canvas.style.cursor = 'grab';
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// L'écart de drag est résorbé en même temps que la pose suivante s'installe.
export function resetDrag() {
  return dragGroup.quaternion;
}

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  buildReticle(); // l'épaisseur est exprimée en pixels
});

// --- Boucle ---
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();

  if (loaded && state.spin) spinGroup.rotation.y += SPIN_SPEED * dt;

  if (!dragging && Math.abs(dragAngle) > 1e-5) {
    dragAngle *= DRAG_INERTIA;
    applyDrag();
  }

  // Le réticule colle à un point de l'axe du foret : il faut donc les matrices
  // à jour, que le rendu ne recalculera qu'après.
  if (reticleGroup.visible) {
    scene.updateMatrixWorld(true);
    reticlePoint.set(0, reticleY, 0);
    spinGroup.localToWorld(reticlePoint);
    reticleGroup.position.copy(reticlePoint);

    // On repart de l'orientation face caméra, puis on tourne dans le plan de
    // l'écran : l'angle est absolu, donc recalculé et non cumulé sur la frame.
    reticleAngle += RETICLE.spin * dt;
    reticleGroup.quaternion.copy(camera.quaternion);
    reticleGroup.rotateZ(reticleAngle);

    // Le halo suit le fondu du trait, dont l'opacité est animée à l'extérieur.
    for (const material of haloMaterials) {
      material.opacity = reticleMaterial.opacity * material.userData.alpha;
    }
  }

  renderer.render(scene, camera);
});

export { camera, renderer, canvas };
