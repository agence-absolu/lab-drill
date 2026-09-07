import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

import drillUrl from '../models/drill-01.glb?url';

const container = document.getElementById('app');
const loaderEl = document.getElementById('loader');

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// --- Scène ---
const scene = new THREE.Scene();

// --- Environnement ---
// Le métal ne montre que ce qu'il reflète. On part d'un studio clair
// (RoomEnvironment) dans lequel on plante des panneaux noirs façon « negative
// fill » : ils n'existent que dans l'environnement réfléchi, jamais dans la
// scène rendue, donc ils sont invisibles à la caméra mais creusent des bandes
// sombres dans les reflets, ce qui détache les arêtes et l'hélice du foret.
const BLACK_PANELS = [
  { size: [3.5, 7], pos: [0, 0, 3.4] },   // face
  { size: [3, 7], pos: [-3.6, 0, -1.4] }, // arrière gauche
  { size: [2.5, 7], pos: [3.4, 0, -2.2] },// arrière droit
  { size: [2, 6], pos: [1.6, 0.4, 3.0] }, // bande fine, côté caméra
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
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.2, 1.6, 2.8);

// --- Interaction ---
// Ce n'est pas la caméra qui tourne mais le foret : la caméra est totalement
// figée (ni orbite ni zoom), comme les lumières et les panneaux, donc
// l'éclairage garde le même caractère quel que soit l'angle du modèle.
const DRAG_SPEED = 0.006; // rad par pixel
const DRAG_INERTIA = 0.93; // 0 = arrêt net, 0.97 = glisse longtemps

const dragGroup = new THREE.Group();
scene.add(dragGroup);

const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
canvas.style.cursor = 'grab';

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

// Bandes réfléchies dans le métal
const stripes = [
  { color: 0xffffff, intensity: 4.5, w: 0.7, h: 4, pos: [2.4, 0.6, 1.8], look: [0, 0, 0] },
  { color: 0xd8e6ff, intensity: 3, w: 0.5, h: 4, pos: [-2.6, 0.2, 1.2], look: [0, 0, 0] },
  { color: 0xfff0d6, intensity: 3.5, w: 0.6, h: 4, pos: [-0.6, 0.8, -2.8], look: [0, 0, 0] },
];

for (const s of stripes) {
  const light = new THREE.RectAreaLight(s.color, s.intensity, s.w, s.h);
  light.position.set(...s.pos);
  light.lookAt(...s.look);
  scene.add(light);
}

// --- Modèle ---
// Le modèle est un STL converti : on le redresse (axe le plus long vers le haut)
// puis on le recadre automatiquement.
const UPRIGHT = true;
const TARGET_HEIGHT = 1.6;
const SPIN_SPEED = 0.25; // rad/s

// Acier poli : le .glb ne porte aucune texture, on règle donc le PBR à la main.
const STEEL = {
  color: 0x8d9298,
  metalness: 0.95,
  roughness: 0.34,
  envMapIntensity: 1.1,
};

let drill = null;

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

    // Recentrer, mettre à l'échelle, poser sur le sol
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = TARGET_HEIGHT / Math.max(size.x, size.y, size.z);

    const pivot = new THREE.Group();
    model.position.sub(center);
    pivot.add(model);
    pivot.scale.setScalar(scale);
    dragGroup.add(pivot);

    // Cadrage caméra sur la boîte englobante
    const fitted = new THREE.Box3().setFromObject(pivot);
    const fSize = fitted.getSize(new THREE.Vector3());
    const fCenter = fitted.getCenter(new THREE.Vector3());
    const maxDim = Math.max(fSize.x, fSize.y, fSize.z);
    const dist = (maxDim / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.45;

    camera.position.set(dist * 0.5, dist * 0.45, dist * 0.72);
    camera.lookAt(fCenter);

    drill = pivot;
    loaderEl.classList.add('hidden');
  },
  undefined,
  (err) => {
    console.error(err);
    loaderEl.textContent = 'Erreur de chargement du modèle';
  }
);

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Boucle ---
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();

  if (drill) drill.rotation.y += SPIN_SPEED * dt;

  // Inertie après relâchement du drag
  if (!dragging && Math.abs(dragAngle) > 1e-5) {
    dragAngle *= DRAG_INERTIA;
    applyDrag();
  }

  renderer.render(scene, camera);
});
