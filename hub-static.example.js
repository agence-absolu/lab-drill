/**
 * Démos du lab — contrat d'intégration à reprendre dans le hub.
 *
 * Objectif : que le hub serve les démos SANS jamais être remodifié ensuite.
 * Une démo publiée dans LAB_DIR/<slug>/ répond alors sur /<slug>/, quel que
 * soit son nom et quel que soit le moment où elle est déposée.
 *
 * Rien ici n'est spécifique à une démo : ce bloc se pose une fois pour toutes.
 *
 * LAB_DIR est un dossier À PART, jamais la racine du hub : les démos y sont
 * déposées par un autre canal que son déploiement. Le hub peut ainsi être
 * redéployé, nettoyé ou reconstruit sans les emporter, une seule ligne de
 * .gitignore suffit à les ignorer, et son propre code reste hors du dossier
 * servi — donc hors de portée du web.
 */

import path from 'node:path';
import compression from 'compression';
import express from 'express';

// Dossier où les démos sont publiées, hors du code du hub.
const LAB_DIR = process.env.LAB_DIR || path.join(import.meta.dirname, 'lab-projects');

// ─── 1. Compression ──────────────────────────────────────────────────────────
// Express ne compresse rien par défaut. Une démo 3D pèse ~1 Mo de JavaScript,
// ramené à ~300 Ko : c'est le réglage qui pèse le plus sur le premier affichage.
app.use(compression());

// ─── 2. Les démos ────────────────────────────────────────────────────────────
// À monter APRÈS les routes propres du hub — ainsi « / » reste au hub — et
// AVANT son handler 404 : express.static laisse passer (fallthrough) ce qu'il
// ne trouve pas, le hub répond donc normalement sur ses propres chemins.
//
// Le type MIME du .glb n'appelle aucun réglage : mime-db le reconnaît
// (model/gltf-binary), tout comme .gltf et .wasm.
app.use(
  express.static(LAB_DIR, {
    index: 'index.html', // /drill/ → /drill/index.html
    dotfiles: 'ignore', // ne jamais exposer un .git ou un .env égaré
    maxAge: '1y', // les fichiers de assets/ portent une empreinte
    setHeaders(res, file) {
      // …sauf le point d'entrée, qui nomme les bundles de la version courante :
      // mis en cache, il continuerait de réclamer ceux de la version d'avant.
      if (file.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
  })
);

// ─── 3. Navigation interne d'une démo (facultatif) ───────────────────────────
// Pour une démo à routage côté client : /<slug>/n-importe-quoi retombe sur son
// index.html. Sans cela, une URL profonde ou un rechargement finirait sur le
// 404 du hub. Le slug est contraint par l'expression régulière, aucun chemin
// ne peut donc remonter hors de LAB_DIR ; `root` le garantit une seconde fois.
app.get(/^\/([a-z0-9][a-z0-9-]*)\//, (req, res, next) => {
  // Un chemin porteur d'une extension désigne un fichier, pas une route : s'il
  // n'a pas été trouvé plus haut, il n'existe pas. Lui renvoyer index.html
  // donnerait du HTML là où le navigateur attend un script — une erreur de type
  // MIME autrement pénible à diagnostiquer.
  if (path.extname(req.path)) return next();

  res.sendFile(path.join(req.params[0], 'index.html'), { root: LAB_DIR }, (err) => {
    if (err) next(); // pas une démo : au hub de répondre
  });
});

// ─── 4. Puis seulement, le 404 du hub ────────────────────────────────────────
