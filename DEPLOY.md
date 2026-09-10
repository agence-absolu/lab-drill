# Déploiement — lab.agence-absolu.com/diager-drill/

Le site compilé est **entièrement statique** (HTML, CSS, JS, un `.glb`). Node
n'intervient qu'à la compilation ; rien ne tourne en permanence pour la démo.

## L'architecture, telle que constatée

`lab.agence-absolu.com` est servi **directement par le hub** : les en-têtes
portent `x-powered-by: Express`, sans trace d'Apache, et une URL inconnue reçoit
le 404 JSON du hub. Aucun `.htaccess` n'a donc d'effet, et rien ne peut être
servi à côté du hub depuis l'espace utilisateur.

Le montage retenu : **le hub sert les démos**, une fois pour toutes. Une démo
publiée dans le dossier convenu répond sur son chemin sans que le hub soit
retouché — c'est le point important, puisqu'il y en aura beaucoup.

## Convention

| Rôle | Chemin |
| --- | --- |
| Dossier des démos (`LAB_DIR`) | `~/lab.agence-absolu.com/` |
| Une démo | `~/lab.agence-absolu.com/<slug>/` |
| URL publique | `https://lab.agence-absolu.com/<slug>/` |

Le `<slug>` est le nom npm du projet (`diager-drill`) : `vite.config.js` en
déduit la base des chemins, le workflow son dossier de destination. Ni l'un ni
l'autre ne nomme le projet — ils se recopient tels quels dans la démo suivante.

## 1. Ce que le hub doit intégrer, une seule fois

Voir `hub-static.example.js` : compression, `express.static` sur `LAB_DIR`, et
un repli pour la navigation interne d'une démo. À poser **après** les routes du
hub — la racine lui reste — et **avant** son handler 404.

Une fois ce bloc en place, plus rien à y faire : toute démo déposée dans
`LAB_DIR` est servie, y compris celles qui n'existent pas encore.

Ce bloc a été vérifié contre un hub Express 5 factice servant cette démo :

| Requête | Résultat |
| --- | --- |
| `/` et `/api/…` | restent au hub |
| `/diager-drill/` | la page de la démo |
| `…/assets/index-*.js` | 200, compressé (969 Ko → 306 Ko) |
| `…/assets/drill-01-*.glb` | 200, `model/gltf-binary` (aucun réglage requis) |
| `/diager-drill/une/route` | repli sur l'`index.html` de la démo |
| `…/assets/absent.js` | 404 — un fichier manquant reste un fichier manquant |
| `/pas-une-demo/x` | le 404 du hub |

## 2. Publier

`.github/workflows/deploy.yml` compile et envoie la démo par **FTPS** à chaque
push sur `main` — ou à la demande, depuis l'onglet Actions.

Trois secrets à créer dans le dépôt (Settings › Secrets and variables › Actions),
avec les identifiants FTP lus dans le Manager Infomaniak :

| Secret | Contenu |
| --- | --- |
| `LAB_FTP_SERVER` | hôte FTP |
| `LAB_FTP_USERNAME` | compte FTP |
| `LAB_FTP_PASSWORD` | mot de passe |

Un point à vérifier au premier essai : `server-dir` vaut
`lab.agence-absolu.com/<slug>/`, ce qui suppose que le compte FTP arrive dans le
home. S'il est cantonné au dossier du site, il faut le réduire à `<slug>/`. Le
journal de l'action affiche le dossier atteint, l'ajustement est immédiat. Si la
connexion est refusée pour cause de certificat, `security: loose` débloque.

Le transport n'est pas SSH parce qu'il ne peut pas l'être : sur un site Node.js
Infomaniak, l'authentification par clé privée n'est pas disponible
([documentation](https://www.infomaniak.com/en/support/faq/2054/connect-with-ssh-key)),
et rien n'est plus fragile qu'un mot de passe SSH rejoué par un runner. FTPS est
chiffré, prévu pour ce cas, et l'action ne transfère que ce qui a changé.

## 3. Ajouter une démo

Rien de plus : le hub ne bouge pas, aucune configuration serveur n'est touchée.
Un nouveau projet part sur ce modèle en y recopiant `.github/workflows/deploy.yml`
et le calcul de `base` de `vite.config.js`, puis en créant les mêmes secrets.

## 4. Développement local

```bash
npm run dev       # http://localhost:5173/diager-drill/
npm run preview   # prévisualise dist/ sur le même sous-chemin
npm run build     # compile dans dist/
```

Autre racine : `BASE_PATH=/ npm run build`.

## En suspens, hors démo

- **Dépôt** — le projet n'a pas encore de remote ; le workflow ne s'exécutera
  qu'une fois le dépôt hébergé et poussé.
- **Certificat** — le certificat servi est celui de `preview.infomaniak.website` ;
  HTTPS déclenche donc un avertissement. À générer dans le Manager.
- **DNS** — `lab.agence-absolu.com` est un CNAME vers `agence-absolu.com`
  (83.228.194.33), qui répond « web host does not exist » en HTTPS. La
  résolution n'est pas encore stabilisée sur le nouveau serveur.

## Références

- [Se connecter avec une clé SSH](https://www.infomaniak.com/en/support/faq/2054/connect-with-ssh-key)
- [Créer un site Node.js chez Infomaniak](https://www.infomaniak.com/fr/support/faq/2537/creer-un-site-nodejs-chez-infomaniak)
