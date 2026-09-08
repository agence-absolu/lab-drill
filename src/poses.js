// Poses du foret, une par section de la page.
//
// Repère : le foret est haut de 1,6 unité et centré sur l'origine — la pointe
// est donc en y = +0,8 et la queue en y = -0,8, avant mise à l'échelle. C'est
// dans ce repère qu'est exprimé `focus`, la hauteur que vise le réticule. Pour
// cadrer une zone, on l'amène au centre de l'écran : pos.y = -(y_local × scale).
// La caméra est fixe en z = 3,4, ce qui laisse voir environ 2,8 unités de haut
// et 5 de large en 16/9 — d'où les décalages latéraux de ±1,25.
//
// Pour régler ces valeurs à la souris plutôt qu'à la main : ouvrir la page avec
// #edit dans l'URL (voir src/pose-editor.js).

export const POSES = {
  // Vue d'ensemble, le foret tourne lentement sur lui-même
  hero: {
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    scale: 1,
    spin: true,
  },

  // La pointe : texte à gauche, foret à droite
  pointe: {
    pos: [1.25, -1.5, 0.2],
    rot: [0, 25, -8],
    scale: 2.4,
    focus: 0.68, // hauteur visée par le réticule, sur l'axe du foret
  },

  // Les goujures : texte à droite, foret à gauche
  goujures: {
    pos: [-1.25, -0.5, 0.1],
    rot: [0, -35, 6],
    scale: 2.0,
    focus: 0.25,
  },

  // La queue : texte à gauche, foret à droite
  queue: {
    pos: [1.25, 1.55, 0.2],
    rot: [0, 190, 5],
    scale: 3.0,
    focus: -0.5,
  },
};

// En portrait, le texte occupe toute la largeur : on ramène le foret au centre
// et on réduit l'échelle pour qu'il tienne dans le cadre.
export function responsive(pose, width) {
  if (width >= 900) return pose;
  const narrow = width < 620;
  return {
    ...pose,
    pos: [pose.pos[0] * (narrow ? 0.12 : 0.5), pose.pos[1] * 0.8, pose.pos[2]],
    scale: pose.scale * (narrow ? 0.62 : 0.8),
  };
}
