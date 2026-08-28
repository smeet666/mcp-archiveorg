# Privacy

This server collects nothing about you, and sends nothing to its author.

_[Version française](#confidentialité)_

---

## What this server is

`mcp-archiveorg` is a read-only client for [the Internet Archive](https://archive.org). It runs on your
own machine, as a process your MCP host starts, and it speaks over stdio. It
listens on no port.

It needs no API key and no account, so there is no credential for it to hold and none for it to send.

## What leaves your machine, and where it goes

**3 hosts are contacted**, and nothing else.

| Host              | What is read there                           |
| ----------------- | -------------------------------------------- |
| `archive.org`     | the Archive's catalogue and its scanned text |
| `web.archive.org` | the Wayback Machine                          |
| `openlibrary.org` | Open Library                                 |

What a request carries:

| What                   | Why it is there                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The question you asked | A search term or an identifier reaches the site as you wrote it.                                                                        |
| A `User-Agent`         | `mcp-archiveorg/<version> (+https://github.com/smeet666/mcp-archiveorg)`, so the site can reach a person about the traffic it receives. |
| Your IP address        | Sent by your network to any host you contact, as with any web request.                                                                  |

One tool looks an address up in the Wayback Machine. The address you pass is the question, so it reaches `web.archive.org` as you wrote it.

Your requests reach the Internet Archive. What is done with them there is governed by that site's own privacy policy, which this project does not control.

## What is kept, and for how long

**Answers are held in memory only, and only while the server runs.** The cache is
a table in the process: it holds what was read so that reading the same page
twice costs one request instead of two. Closing the server empties it.

**Nothing is written to disk.** The server creates no file, no database and no
log file.

## What is never collected

- No analytics, no telemetry, no usage counter.
- Nothing is sent to the author of this project or to any third party.
- No account, no profile, no identifier is created for you.
- Your questions are not stored, forwarded, or used to train anything.

## Logs

The server writes diagnostics to **stderr**, where your MCP host decides what
becomes of them. `IA_LOG_LEVEL` governs how much is written and defaults to `error`. These lines stay on your machine.

## The settings that change any of this

| Variable          | What it changes                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `IA_USER_AGENT`   | Adds your own identifier in front of this project's, which stays appended so the site can always reach a person. |
| `IA_CACHE_TTL_MS` | How long an answer is held in memory. `0` turns the cache off.                                                   |
| `IA_LOG_LEVEL`    | How much is written to stderr.                                                                                   |

## Children

This server is a tool for developers and it is not directed at children.

## Changes

A change to this policy travels in a release, and the changelog names it.

## Contact

Open an issue on [the repository](https://github.com/smeet666/mcp-archiveorg/issues). For something exploitable,
follow [SECURITY.md](./SECURITY.md) instead.

---

# Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur.

## Ce qu'est ce serveur

`mcp-archiveorg` est un client en lecture seule pour [l'Internet Archive](https://archive.org). Il
tourne sur votre machine, comme un processus que votre hôte MCP démarre, et il
parle en stdio. Il n'écoute sur aucun port.

Il ne demande ni clé d'API ni compte, donc il ne détient aucun identifiant et n'en envoie aucun.

## Ce qui quitte votre machine, et où cela va

**3 hôtes sont joints**, et rien d'autre.

| Hôte              | Ce qui y est lu                                 |
| ----------------- | ----------------------------------------------- |
| `archive.org`     | le catalogue de l'Archive et son texte numérisé |
| `web.archive.org` | la Wayback Machine                              |
| `openlibrary.org` | Open Library                                    |

Ce qu'une requête emporte :

| Quoi              | Pourquoi                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La question posée | Un terme de recherche ou un identifiant atteint le site tel que vous l'avez écrit.                                                                      |
| Un `User-Agent`   | `mcp-archiveorg/<version> (+https://github.com/smeet666/mcp-archiveorg)`, pour que le site puisse joindre une personne au sujet du trafic qu'il reçoit. |
| Votre adresse IP  | Transmise par votre réseau à tout hôte que vous joignez, comme pour n'importe quelle requête web.                                                       |

Un outil interroge la Wayback Machine sur une adresse. L'adresse que vous passez est la question, donc elle atteint `web.archive.org` telle que vous l'avez écrite.

Vos requêtes atteignent l'Internet Archive. Ce qui en est fait là-bas relève de la politique de confidentialité de ce site, que ce projet ne contrôle pas.

## Ce qui est conservé, et combien de temps

**Les réponses sont gardées en mémoire seulement, et seulement pendant que le
serveur tourne.** Le cache est une table dans le processus : il retient ce qui a
été lu pour que lire deux fois la même page coûte une requête plutôt que deux.
Fermer le serveur le vide.

**Rien n'est écrit sur le disque.** Le serveur ne crée aucun fichier, aucune base
et aucun journal.

## Ce qui n'est jamais collecté

- Aucune analyse d'audience, aucune télémétrie, aucun compteur d'usage.
- Rien n'est envoyé à l'auteur de ce projet ni à un tiers.
- Aucun compte, aucun profil, aucun identifiant n'est créé pour vous.
- Vos questions ne sont ni stockées, ni transmises, ni utilisées pour entraîner
  quoi que ce soit.

## Les journaux

Le serveur écrit ses diagnostics sur **stderr**, où votre hôte MCP décide de ce
qu'ils deviennent. `IA_LOG_LEVEL` règle leur quantité et vaut `error` par défaut. Ces lignes restent sur votre machine.

## Les réglages qui changent tout cela

| Variable          | Ce qu'elle change                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `IA_USER_AGENT`   | Ajoute votre identifiant devant celui du projet, qui reste accolé pour que le site puisse toujours joindre une personne. |
| `IA_CACHE_TTL_MS` | Combien de temps une réponse est gardée en mémoire. `0` éteint le cache.                                                 |
| `IA_LOG_LEVEL`    | La quantité écrite sur stderr.                                                                                           |

## Les enfants

Ce serveur est un outil pour développeurs et ne s'adresse pas aux enfants.

## Les évolutions

Une modification de cette politique voyage dans une version, et le changelog la
nomme.

## Contact

Ouvrez une issue sur [le dépôt](https://github.com/smeet666/mcp-archiveorg/issues). Pour quelque chose
d'exploitable, suivez plutôt [SECURITY.md](./SECURITY.md).
