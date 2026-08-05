# mcp-archiveorg

[![npm](https://img.shields.io/npm/v/mcp-archiveorg.svg)](https://www.npmjs.com/package/mcp-archiveorg)
[![CI](https://github.com/smeet666/mcp-archiveorg/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-archiveorg/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-archiveorg.svg)](LICENSE)

An MCP server for the Internet Archive. **Search the text inside digitised
books**, browse the catalogue, and read Wayback Machine captures. No API key, no
account, no configuration.

_(Version française plus bas / French version below)_

## Quickstart

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=archiveorg&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1pbnRlcm5ldGFyY2hpdmUiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=archiveorg&config=%7B%22name%22%3A%22archiveorg%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-archiveorg%22%5D%7D)

**Claude Code**

```bash
claude mcp add archiveorg -- npx -y mcp-archiveorg
```

**Claude Desktop, Cursor, and any client using the standard config format**

```json
{
  "mcpServers": {
    "archiveorg": {
      "command": "npx",
      "args": ["-y", "mcp-archiveorg"]
    }
  }
}
```

**Bundle, without npm**

Download `mcp-archiveorg-<version>.mcpb` from
[the latest release](https://github.com/smeet666/mcp-archiveorg/releases/latest)
and open it. A client that supports MCP bundles installs it on its own, with no
npm and no configuration file to edit.

## Tools

| Tool             | What it does                                           | Key parameters                          |
| ---------------- | ------------------------------------------------------ | --------------------------------------- |
| `search_inside`  | Finds a phrase in the text of scanned pages.           | `query`, `limit`, `page`                |
| `search_items`   | Searches the catalogue: films, books, audio, software. | `query`, `media_type`, `sort`           |
| `get_item`       | Reads one record, section by section.                  | `identifier`, `sections`, `file_format` |
| `get_snapshot`   | The Wayback capture closest to a date.                 | `url`, `at`                             |
| `list_snapshots` | Captures of a page, oldest first.                      | `url`, `limit`, `cursor`                |
| `search_books`   | A work on Open Library: author, year, editions, scans. | `query`                                 |

The server is **read-only**. It uploads nothing and writes nothing back.

## Searching inside the books is the point

A catalogue search reads titles and descriptions. `search_inside` reads what
optical character recognition took off millions of scanned pages, so it answers
a question nothing else here can: _which book contains this phrase_. A match
comes back with the item, the passage around the phrase, and a link.

### Three things it will not pretend to know

**There is no page number.** The index reports where the search text sits
inside the item, which is `1` on nearly every match. It is not a leaf of the
book. Nothing here publishes a page, and no link claims one: a citation naming
a page the index does not know is worse than a citation naming none.

**`total` counts documents, and it pages.** It is not a number of occurrences.
The last page of a match set is shorter than the first and the one after it is
empty, so read past page 1 rather than treating the first answer as the whole
of it.

**A title can describe the container.** An item can bundle several documents,
and a match inside one of them carries the item's title, creator and year.
`inside_container` says when that happened, and `matched_file` names what
actually holds the passage.

## Other things worth knowing

**A capture is rarely on the date you asked for.** `get_snapshot` always
reports `days_from_requested`, because the closest capture of a quiet site can
be years away. A page asked for in March 1994 can answer with December 1996.

**The capture index is slow, and it has no offset.** Tens of seconds on a busy
address, and it ignores an offset entirely. It pages by a key it hands back:
pass `next_cursor` as `cursor`, and a null one means the end of the history.

**A catalogue search matches descriptions too.** A compilation whose notes
mention a name ranks alongside that person's own work. Read `creator` before
attributing a result.

**Scanned text is machine-read.** Excerpts carry the misreadings that come with
it. Quote them as scanned text and follow the link.

**Nothing states what may be reused.** Many items carry no licence at all, and
the Archive holds material under every possible term. `get_item` says so rather
than letting silence read as permission.

## Configuration

Every variable is optional. Set them in the `env` block of your MCP client.

| Variable                | Default                | Purpose                                                                                                  |
| ----------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `IA_USER_AGENT`         | _(project identifier)_ | Identify your own client. The project's identifier is appended, so the Archive can always reach a human. |
| `IA_MIN_INTERVAL_MS`    | `1000`                 | Minimum gap between requests. Values below 500 ms are refused.                                           |
| `IA_TIMEOUT_MS`         | `20000`                | Per-request deadline.                                                                                    |
| `IA_HISTORY_TIMEOUT_MS` | `60000`                | Deadline for the capture index, which is slow by design.                                                 |
| `IA_MAX_RETRIES`        | `3`                    | Retries on rate limiting and transient errors.                                                           |
| `IA_CACHE_TTL_MS`       | `900000`               | In-memory cache lifetime. `0` turns it off.                                                              |
| `IA_CACHE_MAX_ENTRIES`  | `200`                  | In-memory cache size.                                                                                    |
| `IA_LOG_LEVEL`          | `error`                | `silent`, `error`, `info` or `debug`. Logs go to stderr.                                                 |

## How this server treats the Archive

The Internet Archive is a non-profit that charges nobody and turns nobody away.
This server paces itself to one request at a time with a gap that configuration
can widen but never narrow past half a second, widens it further when the site
pushes back, caches what it reads, and identifies itself with an address a human
can be reached at. A caller may say who they are; that address is appended
rather than replaced.

`archive.org/robots.txt` disallows only `/control/` and `/report/`, neither of
which is touched here. No route used requires a key, and none of them is
documented: they are the routes the Archive's own pages call, which is why the
nightly canary matters more here than it would against a published API.

## Troubleshooting

**`rate_limited`.** The Archive asked this client to slow down. It never means
the thing you asked for is missing.

**`invalid_input` on a search.** The query was refused rather than answered.
An unbalanced quotation mark, bracket or colon is read as an operator.

**`parse_failure`.** A response arrived in a shape this server cannot read,
which usually means a route changed. Please
[open an issue](https://github.com/smeet666/mcp-archiveorg/issues) with the
arguments you used.

## Development

```bash
npm install
npm test                 # unit tests, no network
npm run typecheck
npm run build
IA_LIVE=1 npm run test:live   # one request per route against the real site
npm run inspector        # explore the tools in the MCP Inspector
```

Fixtures are generated rather than captured: `npm run build:fixtures` writes a
corpus of invented titles and passages, so tests are deterministic and no
Archive content lives in this repository.

The access layer under `src/ia` does not import the MCP SDK and is published
separately as `mcp-archiveorg/client`, usable as a plain library.

## Contributing

Bugs, questions and ideas all belong in
[the issue tracker](https://github.com/smeet666/mcp-archiveorg/issues).
Pull requests are welcome; please open an issue first so we can agree on what
the right answer is before you write it. [CONTRIBUTING.md](CONTRIBUTING.md) has
the detail, and [SECURITY.md](SECURITY.md) covers anything exploitable.

## Support

Free, and it stays free. If it saved you some time, you can
[buy me a coffee](https://buymeacoffee.com/smeet666).

## License

MIT. See [LICENSE](LICENSE). The licence covers this source code only, not the
material retrieved through it, which carries whatever terms its depositor
attached, and often none at all.

This is an unofficial project, with no affiliation to or endorsement by the
Internet Archive.

---

# mcp-archiveorg (français)

Un serveur MCP pour l'Internet Archive. **Cherchez une phrase dans le texte des
livres numérisés**, parcourez le catalogue, et lisez les captures de la Wayback
Machine. Sans clé d'API, sans compte, sans configuration.

## Démarrage rapide

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=archiveorg&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1pbnRlcm5ldGFyY2hpdmUiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=archiveorg&config=%7B%22name%22%3A%22archiveorg%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-archiveorg%22%5D%7D)

**Claude Code**

```bash
claude mcp add archiveorg -- npx -y mcp-archiveorg
```

**Claude Desktop, Cursor, et tout client utilisant le format standard**

```json
{
  "mcpServers": {
    "archiveorg": {
      "command": "npx",
      "args": ["-y", "mcp-archiveorg"]
    }
  }
}
```

**Bundle, sans npm**

Téléchargez `mcp-archiveorg-<version>.mcpb` depuis
[la dernière release](https://github.com/smeet666/mcp-archiveorg/releases/latest)
et ouvrez-le. Un client compatible l'installe seul, sans npm ni fichier de
configuration à modifier.

## Outils

| Outil            | Rôle                                                    | Paramètres principaux                   |
| ---------------- | ------------------------------------------------------- | --------------------------------------- |
| `search_inside`  | Trouve une phrase dans le texte des pages numérisées.   | `query`, `limit`, `page`                |
| `search_items`   | Cherche le catalogue : films, livres, audio, logiciels. | `query`, `media_type`, `sort`           |
| `get_item`       | Lit une fiche, section par section.                     | `identifier`, `sections`, `file_format` |
| `get_snapshot`   | La capture Wayback la plus proche d'une date.           | `url`, `at`                             |
| `list_snapshots` | Les captures d'une page, de la plus ancienne.           | `url`, `limit`, `cursor`                |
| `search_books`   | Une œuvre sur Open Library : auteur, année, éditions.   | `query`                                 |

Le serveur est **en lecture seule**. Il ne téléverse rien et n'écrit rien.

## Chercher à l'intérieur des livres est le cœur du sujet

Une recherche de catalogue lit les titres et les descriptions. `search_inside`
lit ce que la reconnaissance de caractères a tiré de millions de pages
numérisées, et répond donc à une question qu'aucun autre outil ici ne sait
traiter : _quel livre contient cette phrase_.

### Trois choses qu'il refuse de prétendre savoir

**Il n'y a pas de numéro de page.** L'index indique où se situe le texte
cherchable dans l'élément, ce qui vaut `1` sur presque toutes les
correspondances. Ce n'est pas un feuillet du livre. Rien ici ne publie de page,
et aucun lien n'en revendique : une citation qui nomme une page que l'index
ignore est pire qu'une citation qui n'en nomme aucune.

**`total` compte des documents, et il se pagine.** Ce n'est pas un nombre
d'occurrences. Lisez au-delà de la page 1 plutôt que de prendre la première
réponse pour la totalité.

**Un titre peut décrire le contenant.** Un élément peut regrouper plusieurs
documents. `inside_container` le signale, et `matched_file` nomme celui qui
porte réellement le passage.

## Autres points utiles

**Une capture tombe rarement sur la date demandée.** `get_snapshot` annonce
toujours `days_from_requested` : la capture la plus proche d'un site peu visité
peut être à des années.

**L'index des captures est lent, et n'a pas d'offset.** Il l'ignore
complètement. Il se parcourt avec la clé qu'il renvoie : repassez `next_cursor`
en `cursor`, et une valeur nulle marque la fin de l'histoire.

**La recherche catalogue lit aussi les descriptions.** Une compilation citant un
nom se classe à côté des disques de cette personne. Vérifiez `creator` avant
d'attribuer un résultat.

**Le texte numérisé est lu par une machine.** Les extraits en portent les
fautes. Citez-les comme tels et suivez le lien.

**Rien n'indique ce qui est réutilisable.** Beaucoup d'éléments ne portent
aucune licence. `get_item` le dit, plutôt que de laisser le silence passer pour
une permission.

## Configuration

Toutes les variables sont optionnelles, à déclarer dans le bloc `env` de votre
client.

| Variable                | Défaut                    | Rôle                                                                                                                  |
| ----------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `IA_USER_AGENT`         | _(identifiant du projet)_ | Identifiez votre client. L'identifiant du projet est ajouté, pour que l'Archive puisse toujours joindre une personne. |
| `IA_MIN_INTERVAL_MS`    | `1000`                    | Écart minimal entre requêtes. En dessous de 500 ms, la valeur est refusée.                                            |
| `IA_TIMEOUT_MS`         | `20000`                   | Délai par requête.                                                                                                    |
| `IA_HISTORY_TIMEOUT_MS` | `60000`                   | Délai pour l'index des captures, lent par nature.                                                                     |
| `IA_MAX_RETRIES`        | `3`                       | Tentatives en cas de limitation ou d'erreur passagère.                                                                |
| `IA_CACHE_TTL_MS`       | `900000`                  | Durée de vie du cache mémoire. `0` le désactive.                                                                      |
| `IA_CACHE_MAX_ENTRIES`  | `200`                     | Taille du cache mémoire.                                                                                              |
| `IA_LOG_LEVEL`          | `error`                   | `silent`, `error`, `info` ou `debug`. Sortie sur stderr.                                                              |

## Ce que ce serveur doit à l'Archive

L'Internet Archive est une association qui ne facture rien et ne refuse
personne. Ce serveur se limite à une requête à la fois, avec un écart que la
configuration peut élargir mais jamais réduire sous la demi-seconde, l'élargit
encore quand le site demande de l'air, met en cache ce qu'il lit, et s'identifie
avec une adresse où joindre une personne. Un appelant peut dire qui il est ;
cette adresse est ajoutée, pas remplacée.

Le `robots.txt` d'archive.org n'interdit que `/control/` et `/report/`, dont
aucun n'est touché ici. Aucune route utilisée n'exige de clé, et aucune n'est
documentée : ce sont celles qu'appellent les pages du site, ce qui rend le
canari nocturne plus important ici que face à une API publiée.

## Dépannage

**`rate_limited`.** L'Archive demande à ce client de ralentir. Cela ne signifie
jamais que ce que vous cherchez est absent.

**`invalid_input` sur une recherche.** La requête a été refusée, pas répondue.
Un guillemet, un crochet ou un deux-points non équilibré est lu comme un
opérateur.

**`parse_failure`.** Une réponse est arrivée dans une forme illisible pour ce
serveur, ce qui signale en général qu'une route a changé. Merci
[d'ouvrir une issue](https://github.com/smeet666/mcp-archiveorg/issues).

## Développement

```bash
npm install
npm test                 # tests unitaires, sans réseau
npm run typecheck
npm run build
IA_LIVE=1 npm run test:live   # une requête par route sur le vrai site
npm run inspector        # explorer les outils dans le MCP Inspector
```

Les fixtures sont générées, pas capturées : `npm run build:fixtures` écrit un
corpus de titres et de passages inventés, ce qui rend les tests déterministes et
évite de stocker du contenu de l'Archive dans ce dépôt.

La couche d'accès sous `src/ia` n'importe pas le SDK MCP et est publiée
séparément sous `mcp-archiveorg/client`, utilisable comme bibliothèque.

## Contribuer

Bugs, questions et idées vont dans
[le suivi d'issues](https://github.com/smeet666/mcp-archiveorg/issues). Les
pull requests sont bienvenues ; ouvrez d'abord une issue pour qu'on s'accorde
sur la bonne réponse avant que vous n'écriviez le code.

## Soutenir

Gratuit, et ça le reste. Si ça vous a fait gagner du temps, vous pouvez
[m'offrir un café](https://buymeacoffee.com/smeet666).

## Licence

MIT, voir [LICENSE](LICENSE). La licence couvre uniquement ce code source, pas
les documents récupérés par son intermédiaire, qui portent les conditions que
leur déposant y a attachées, et souvent aucune.

Projet non officiel, sans affiliation à l'Internet Archive ni approbation de sa
part.
