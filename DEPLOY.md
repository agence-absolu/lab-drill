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

`.github/workflows/deploy.yml` compile et envoie la démo par **rsync sur SSH** à
chaque push sur `main` — ou à la demande, depuis l'onglet Actions.

Secrets à créer dans le dépôt (Settings › Secrets and variables › Actions) :

| Secret | Contenu |
| --- | --- |
| `LAB_SSH_HOST` | hôte SSH, `…ssh.hosting-ik.com` |
| `LAB_SSH_USER` | compte SSH |
| `LAB_SSH_PASSWORD` | mot de passe |
| `LAB_SSH_KNOWN_HOSTS` | facultatif — sortie de `ssh-keyscan <hôte>` |

Sans le dernier, le workflow relève l'empreinte du serveur au premier contact et
la croit sur parole. Le renseigner épingle le serveur une fois pour toutes.

### Pourquoi ni clé SSH, ni FTPS

Les deux voies plus propres sont fermées côté Infomaniak, l'une et l'autre
vérifiées plutôt que supposées :

- **clé privée** : indisponible sur un site Node.js
  ([documentation](https://www.infomaniak.com/en/support/faq/2054/connect-with-ssh-key)) ;
- **FTPS** : le port 21 ne répond pas depuis l'extérieur — connexion en timeout,
  d'où l'`AggregateError: (control socket)` du premier essai.

Le port 22, lui, est joignable depuis n'importe quelle machine, donc depuis un
runner GitHub. Reste un mot de passe en secret, ce qui n'est pas idéal : le jour
où Infomaniak ouvrira l'authentification par clé, il suffira de remplacer
`sshpass -e` par une clé déployée.

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
