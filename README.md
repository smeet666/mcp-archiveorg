# mcp-archiveorg

[![npm](https://img.shields.io/npm/v/mcp-archiveorg.svg)](https://www.npmjs.com/package/mcp-archiveorg)
[![CI](https://github.com/smeet666/mcp-archiveorg/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-archiveorg/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-archiveorg.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-archiveorg)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-archiveorg/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-archiveorg)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-archiveorg-1wia08?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-archiveorg-1wia08)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=archiveorg&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hcmNoaXZlb3JnIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=archiveorg&config=%7B%22name%22%3A%22archiveorg%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-archiveorg%22%5D%7D)

<!-- m8ven-verify: 1b912922cee8f3a46080bbb4b83487e1 -->

The [Internet Archive](https://archive.org) is a non-profit library that keeps
what the world publishes: scanned books, films, recorded music, radio, software,
and the pages of the web itself, captured over and over since 1996 in the Wayback
Machine. Millions of its books and documents have been run through optical
character recognition, so the words inside them can be searched, and the Open
Library index beside it describes works, their editions and their subjects.

This server connects a chat client to that library. You can search the full text
inside its documents, search its catalogue of items, read one item's record and
its files, look up a book by subject, place, period or person, and read the web
as it stood on a given day. It needs no API key and no account.

_[Version française](#mcp-archiveorg-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=archiveorg&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hcmNoaXZlb3JnIl19)
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

Node 24 or later is required, and no environment variable has to be set.

### With Docker

```json
{
  "mcpServers": {
    "archiveorg": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-archiveorg:2.0.1"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`archive.org`, `web.archive.org` and `openlibrary.org`, and nothing else: no
volume, no port, no credential.

### Bundle, without npm

Download `mcp-archiveorg-2.0.1.mcpb` from
[the latest release](https://github.com/smeet666/mcp-archiveorg/releases/latest)
and open it. A client that supports MCP bundles installs it on its own, with no
npm and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- "Which books mention the Beaumont light-house?"
- "Find me items about the 1906 San Francisco earthquake."
- "What files does that item hold, and what licence is it under?"
- "Find me books on beekeeping in France published before 1900."
- "What did that website look like in March 2001?"

The ordinary path runs from a search to a record: a row carries an `identifier`,
and `get_item` reads it.

## Tools

| Tool             | What it does                                                      |
| ---------------- | ----------------------------------------------------------------- |
| `search_inside`  | Searches the words inside the archive's scanned documents.        |
| `search_items`   | Searches the catalogue by title, creator, subject and media type. |
| `get_item`       | Reads one item's record, its files and its licence.               |
| `search_books`   | Finds books by subject, place, period, person, length or year.    |
| `list_snapshots` | Lists the captures the Wayback Machine holds for an address.      |
| `get_snapshot`   | Reads one capture of an address, at or near a date.               |

### `search_inside`

Searches the text inside the archive's documents, which came off the page through
optical character recognition, so a passage carries the misreadings of that
process.

| Argument                 | Type                               | Required | What it does                                 |
| ------------------------ | ---------------------------------- | -------- | -------------------------------------------- |
| `query`                  | string, 2 to 300 characters        | yes      | The phrase to look for inside the documents. |
| `limit`                  | integer, 1 to 50, default `10`     | no       | Matches to serve.                            |
| `page`                   | integer, 1 to 100, default `1`     | no       | Which page of matches.                       |
| `max_excerpt_chars`      | integer, 80 to 1200, default `300` | no       | How much of a passage to serve.              |
| `max_excerpts_per_match` | integer, 1 to 10, default `3`      | no       | Passages served per matching document.       |

**In return:** `hits`, each carrying `identifier`, which `get_item` takes;
`title`, `creator` and `year`; `excerpts`, the passages as a machine read them
off the page; `matched_file`, naming what actually holds the passage; and
`source_url`. `inside_container` is true when the item bundles several documents
and the passage sits in one of them, in which case the title, the creator and the
year belong to the container.

**`total` counts documents, and it pages.** It is a number of documents and the last page of a match set is shorter than the
first. **No page number is available:** the index reports where the text sits
inside the item, which is `1` on nearly every match, so nothing here states a
page of a book and no link claims one.

### `search_items`

Searches the catalogue itself, across every kind of thing the archive holds.

| Argument     | Type                                                                         | Required | What it does                        |
| ------------ | ---------------------------------------------------------------------------- | -------- | ----------------------------------- |
| `query`      | string, 1 to 300 characters                                                  | yes      | Words to look for in the catalogue. |
| `media_type` | `texts`, `movies`, `audio`, `image`, `software`, `data` or `web`             | no       | The kind of thing to keep.          |
| `year_from`  | integer, 1 to 2200                                                           | no       | Earliest year.                      |
| `year_to`    | integer, 1 to 2200                                                           | no       | Latest year.                        |
| `sort`       | `relevance`, `downloads`, `newest`, `oldest` or `title`, default `relevance` | no       | How the rows are ordered.           |
| `limit`      | integer, 1 to 50, default `10`                                               | no       | Rows to serve.                      |
| `page`       | integer, 1 to 100, default `1`                                               | no       | Which page of rows.                 |

**In return:** `items`, each carrying `identifier`, `title`, `creator`, `year`,
`media_type`, `downloads` and `source_url`, a field the record leaves empty being
`null`. `total` counts the items matching across the catalogue, which is more
than the number returned.

### `get_item`

Reads one item's record. The heavier parts are asked for rather than served by
default, since a record can run long.

| Argument                | Type                                                            | Required | What it does                          |
| ----------------------- | --------------------------------------------------------------- | -------- | ------------------------------------- |
| `identifier`            | string, 1 to 200 characters                                     | yes      | The identifier a search row carries.  |
| `sections`              | array of `basic`, `files`, `full_metadata`, default `["basic"]` | no       | Which parts to return.                |
| `file_format`           | string, up to 60 characters                                     | no       | Keep the files of one format.         |
| `max_files`             | integer, 1 to 200, default `25`                                 | no       | Ceiling on the files returned.        |
| `max_description_chars` | integer, 100 to 20000, default `2000`                           | no       | How much of the description to serve. |

**In return:** the item with its `title`, `creator`, `year`, `media_type` and
`source_url`, plus `description`, `date`, `publisher`, `language`, `collections`
and `license_url`, each `null` where the record states nothing. `file_count`
counts the files the item holds whatever this answer returned, and `total_bytes`
their weight. `files` and `full_metadata` are present only when asked for in
`sections`.

### `search_books`

Finds books through the index of works beside the archive, which describes a work
and its editions rather than one scanned copy.

| Argument    | Type                                                                        | Required | What it does                           |
| ----------- | --------------------------------------------------------------------------- | -------- | -------------------------------------- |
| `query`     | string, 2 to 300 characters                                                 | no       | Free text, when there is any.          |
| `subject`   | string, 2 to 100 characters                                                 | no       | A subject the index files works under. |
| `place`     | string, 2 to 100 characters                                                 | no       | A place a work is about.               |
| `time`      | string, 2 to 100 characters                                                 | no       | A period a work is about.              |
| `person`    | string, 2 to 100 characters                                                 | no       | A person a work is about.              |
| `language`  | string, 2 to 20 characters                                                  | no       | The language of the work.              |
| `year_from` | integer, 1 to 2200                                                          | no       | Earliest first publication.            |
| `year_to`   | integer, 1 to 2200                                                          | no       | Latest first publication.              |
| `pages_min` | integer, 1 to 100000                                                        | no       | Shortest acceptable work.              |
| `pages_max` | integer, 1 to 100000                                                        | no       | Longest acceptable work.               |
| `sort`      | `relevance`, `rating`, `readers`, `newest` or `oldest`, default `relevance` | no       | How the rows are ordered.              |
| `limit`     | integer, 1 to 50, default `10`                                              | no       | Rows to serve.                         |
| `page`      | integer, 1 to 100, default `1`                                              | no       | Which page of rows.                    |

**In return:** `books`, each carrying `title`, `authors`, `first_published_year`,
`edition_count`, `archive_identifiers` for the scanned copies the archive holds,
`scan_count`, `page_count` as a median across editions, `subjects` and
`source_url`. `searched_for` says in words what this answer answers, free text
and every criterion applied, and `query` is `null` when the search was made of
criteria alone. `total` counts the works matching.

### `list_snapshots`

Lists the captures the Wayback Machine holds for one address.

| Argument | Type                            | Required | What it does                               |
| -------- | ------------------------------- | -------- | ------------------------------------------ |
| `url`    | string, 3 to 2000 characters    | yes      | The address to look up.                    |
| `limit`  | integer, 1 to 100, default `20` | no       | Captures to serve.                         |
| `cursor` | string, up to 500 characters    | no       | The `next_cursor` a previous answer named. |

**In return:** `snapshots`, each with its `captured_at` as an ISO timestamp in
UTC, the `url` of the capture itself, and the `status` the crawl recorded.
`first` and `last` describe this answer rather than the whole history, and
`next_cursor` continues the listing.

### `get_snapshot`

Reads one capture of an address, at a date or near it.

| Argument | Type                             | Required | What it does                                        |
| -------- | -------------------------------- | -------- | --------------------------------------------------- |
| `url`    | string, 3 to 2000 characters     | yes      | The address to look up.                             |
| `at`     | `YYYY-MM-DD` or an ISO timestamp | no       | The date to aim for. The newest capture by default. |

**In return:** the `snapshot` with its `captured_at` and its address, beside the
`requested_url` and `requested_at`, so the distance between the date asked for
and the capture served is visible. The Wayback Machine answers a date it has no
capture for with the nearest one it holds.

## What excerpts are worth

The text inside a scanned document came off the page through optical character
recognition. A passage therefore carries the misreadings of that process, and it
is served as it was read rather than corrected: a word that reads oddly is what
the machine saw. Quote a passage as an excerpt of a scan, and link the item so a
reader can look at the page.

## Configuration

Every variable is optional. Set them in the `env` block of your client config.

| Variable                | Default              | What it does                                                                          |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `IA_USER_AGENT`         | the project identity | Names your application to the archive, with an address where a person can be reached. |
| `IA_MIN_INTERVAL_MS`    | `1000`               | Gap between two requests, from 500 to 60000.                                          |
| `IA_TIMEOUT_MS`         | `20000`              | Deadline for one request, from 1000 to 120000.                                        |
| `IA_HISTORY_TIMEOUT_MS` | `60000`              | Deadline for a Wayback Machine history, from 5000 to 180000.                          |
| `IA_MAX_RETRIES`        | `3`                  | Attempts after a transient failure, from 0 to 8.                                      |
| `IA_CACHE_TTL_MS`       | `900000`             | How long an answer stays in memory, from 0 to 86400000.                               |
| `IA_CACHE_MAX_ENTRIES`  | `200`                | Answers held in memory at once, from 1 to 5000.                                       |
| `IA_LOG_LEVEL`          | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                              |

A value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                                                 |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `not_found`     | The archive answered, and holds no such item.           | Check the identifier with `search_items`.                                                                  |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument.                                                                |
| `rate_limited`  | The archive asked this client to slow down.             | Wait the number of seconds the hint names and call again with the same arguments. The item is still there. |
| `parse_failure` | The answer arrived in a shape this client cannot read.  | Report it at [the issue tracker](https://github.com/smeet666/mcp-archiveorg/issues).                       |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                                         |
| `timeout`       | The request passed its deadline.                        | Raise `IA_TIMEOUT_MS`, or `IA_HISTORY_TIMEOUT_MS` for a capture history.                                   |

## As a library

The layer reading the archive is published on its own, with its pacing, its cache
and its errors, and with no protocol attached.

```ts
import { ArchiveClient } from "mcp-archiveorg/client";

const client = new ArchiveClient();
const { data, cached } = await client.searchItems({ query: "san francisco earthquake" });
console.log(data.total, cached);
```

Each read answers `{ data, cached }`, and throws an error carrying one of the six
codes. The floor between two requests holds here as well.

## Pacing and attribution

Requests go out one at a time with at least a second between them, and the floor
of half a second holds however the server is configured. The `User-Agent` always
ends with the project identity and an address where a person can be reached. The
Internet Archive is a non-profit library, and a search inside its documents is
one of the more expensive questions it answers.

Every result carries the address of the page it was read from. The items belong
to the people and institutions who deposited them, under the terms each record
states in `license_url`.

This MCP server is an unofficial project, with no affiliation to the Internet
Archive.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `archive.org`, `web.archive.org` and `openlibrary.org` and nothing else, holds its answers in memory
while it runs, and writes nothing to disk.
[PRIVACY.md](PRIVACY.md) states what a request carries and which settings change
any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
archive itself.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-archiveorg/issues). Pull
requests are welcome; opening an issue first helps agree on the shape of the
change. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The items belong to their depositors, under the
terms each record states.

---

<a name="mcp-archiveorg-français"></a>

# mcp-archiveorg (français)

_[English version](#mcp-archiveorg)_

L'[Internet Archive](https://archive.org) est une bibliothèque à but non lucratif
qui conserve ce que le monde publie : livres numérisés, films, musique
enregistrée, radio, logiciels, et les pages du web elles-mêmes, capturées encore
et encore depuis 1996 dans la Wayback Machine. Des millions de ses livres et
documents sont passés par la reconnaissance optique de caractères, si bien que
les mots qu'ils contiennent sont cherchables, et l'index Open Library qui la
côtoie décrit les œuvres, leurs éditions et leurs sujets.

Ce serveur relie un client de conversation à cette bibliothèque. On peut y
chercher dans le texte intégral de ses documents, chercher dans son catalogue,
lire la fiche d'un document et ses fichiers, trouver un livre par sujet, lieu,
période ou personne, et lire le web tel qu'il était un jour donné. Aucune clé
d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=archiveorg&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hcmNoaXZlb3JnIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=archiveorg&config=%7B%22name%22%3A%22archiveorg%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-archiveorg%22%5D%7D)

**Claude Code**

```bash
claude mcp add archiveorg -- npx -y mcp-archiveorg
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

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

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

### Avec Docker

```json
{
  "mcpServers": {
    "archiveorg": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-archiveorg:2.0.1"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `archive.org`, `web.archive.org` et `openlibrary.org`, et de rien
d'autre : aucun volume, aucun port, aucun identifiant.

### Bundle, sans npm

Téléchargez `mcp-archiveorg-2.0.1.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-archiveorg/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Quels livres mentionnent le phare de Beaumont ? »
- « Trouve-moi des documents sur le tremblement de terre de San Francisco en 1906. »
- « Quels fichiers contient ce document, et sous quelle licence ? »
- « Trouve-moi des livres sur l'apiculture en France publiés avant 1900. »
- « À quoi ressemblait ce site en mars 2001 ? »

Le chemin ordinaire va d'une recherche à une fiche : une ligne porte un
`identifier`, et `get_item` le lit.

## Les outils

| Outil            | Ce qu'il fait                                                            |
| ---------------- | ------------------------------------------------------------------------ |
| `search_inside`  | Cherche dans les mots contenus dans les documents numérisés.             |
| `search_items`   | Cherche dans le catalogue par titre, auteur, sujet et type de média.     |
| `get_item`       | Lit la fiche d'un document, ses fichiers et sa licence.                  |
| `search_books`   | Trouve des livres par sujet, lieu, période, personne, longueur ou année. |
| `list_snapshots` | Liste les captures que la Wayback Machine garde d'une adresse.           |
| `get_snapshot`   | Lit une capture d'une adresse, à une date ou près d'elle.                |

### `search_inside`

Cherche dans le texte contenu dans les documents, texte issu de la reconnaissance
optique de caractères, donc un passage porte les erreurs de lecture de ce
procédé.

| Argument                 | Type                            | Requis | Ce qu'il fait                               |
| ------------------------ | ------------------------------- | ------ | ------------------------------------------- |
| `query`                  | chaîne, 2 à 300 caractères      | oui    | La phrase à chercher dans les documents.    |
| `limit`                  | entier, 1 à 50, défaut `10`     | non    | Correspondances à servir.                   |
| `page`                   | entier, 1 à 100, défaut `1`     | non    | Quelle page de correspondances.             |
| `max_excerpt_chars`      | entier, 80 à 1200, défaut `300` | non    | La longueur de passage à servir.            |
| `max_excerpts_per_match` | entier, 1 à 10, défaut `3`      | non    | Passages servis par document correspondant. |

**En retour :** `hits`, chacun portant `identifier`, que `get_item` reprend ;
`title`, `creator` et `year` ; `excerpts`, les passages tels qu'une machine les a
lus sur la page ; `matched_file`, qui nomme ce qui contient réellement le
passage ; et `source_url`. `inside_container` est vrai quand le document en
rassemble plusieurs et que le passage se trouve dans l'un d'eux, auquel cas le
titre, l'auteur et l'année appartiennent au contenant.

**`total` compte des documents, et il pagine.** C'est un nombre de documents et la dernière page d'un ensemble est plus courte
que la première. **Aucun numéro de page n'est disponible :** l'index indique où
le texte se trouve dans le document, ce qui vaut `1` sur presque toutes les
correspondances, donc rien ici n'énonce une page de livre et aucun lien n'en
revendique.

### `search_items`

Cherche dans le catalogue lui-même, à travers tout ce que l'archive conserve.

| Argument     | Type                                                                        | Requis | Ce qu'il fait                     |
| ------------ | --------------------------------------------------------------------------- | ------ | --------------------------------- |
| `query`      | chaîne, 1 à 300 caractères                                                  | oui    | Les mots à chercher au catalogue. |
| `media_type` | `texts`, `movies`, `audio`, `image`, `software`, `data` ou `web`            | non    | Le type de chose à garder.        |
| `year_from`  | entier, 1 à 2200                                                            | non    | Année la plus ancienne.           |
| `year_to`    | entier, 1 à 2200                                                            | non    | Année la plus récente.            |
| `sort`       | `relevance`, `downloads`, `newest`, `oldest` ou `title`, défaut `relevance` | non    | L'ordre des lignes.               |
| `limit`      | entier, 1 à 50, défaut `10`                                                 | non    | Lignes à servir.                  |
| `page`       | entier, 1 à 100, défaut `1`                                                 | non    | Quelle page de lignes.            |

**En retour :** `items`, chacun portant `identifier`, `title`, `creator`, `year`,
`media_type`, `downloads` et `source_url`, un champ que la fiche laisse vide
valant `null`. `total` compte les documents correspondants dans tout le
catalogue, ce qui dépasse le nombre rendu.

### `get_item`

Lit la fiche d'un document. Les parties lourdes se demandent au lieu d'être
servies par défaut, une fiche pouvant être longue.

| Argument                | Type                                                             | Requis | Ce qu'il fait                           |
| ----------------------- | ---------------------------------------------------------------- | ------ | --------------------------------------- |
| `identifier`            | chaîne, 1 à 200 caractères                                       | oui    | L'identifiant que porte une ligne.      |
| `sections`              | tableau de `basic`, `files`, `full_metadata`, défaut `["basic"]` | non    | Les parties à rendre.                   |
| `file_format`           | chaîne, jusqu'à 60 caractères                                    | non    | Ne garder que les fichiers d'un format. |
| `max_files`             | entier, 1 à 200, défaut `25`                                     | non    | Plafond sur les fichiers rendus.        |
| `max_description_chars` | entier, 100 à 20000, défaut `2000`                               | non    | La longueur de description à servir.    |

**En retour :** le document avec son `title`, `creator`, `year`, `media_type` et
`source_url`, plus `description`, `date`, `publisher`, `language`, `collections`
et `license_url`, chacun `null` là où la fiche n'indique rien. `file_count`
compte les fichiers que le document contient quel que soit ce que cette réponse a
rendu, et `total_bytes` leur poids. `files` et `full_metadata` ne sont là que
lorsqu'ils sont demandés dans `sections`.

### `search_books`

Trouve des livres via l'index d'œuvres qui côtoie l'archive, lequel décrit une
œuvre et ses éditions plutôt qu'un exemplaire numérisé.

| Argument    | Type                                                                       | Requis | Ce qu'il fait                          |
| ----------- | -------------------------------------------------------------------------- | ------ | -------------------------------------- |
| `query`     | chaîne, 2 à 300 caractères                                                 | non    | Du texte libre, quand il y en a.       |
| `subject`   | chaîne, 2 à 100 caractères                                                 | non    | Un sujet sous lequel l'index classe.   |
| `place`     | chaîne, 2 à 100 caractères                                                 | non    | Un lieu dont une œuvre traite.         |
| `time`      | chaîne, 2 à 100 caractères                                                 | non    | Une période dont une œuvre traite.     |
| `person`    | chaîne, 2 à 100 caractères                                                 | non    | Une personne dont une œuvre traite.    |
| `language`  | chaîne, 2 à 20 caractères                                                  | non    | La langue de l'œuvre.                  |
| `year_from` | entier, 1 à 2200                                                           | non    | Première publication la plus ancienne. |
| `year_to`   | entier, 1 à 2200                                                           | non    | Première publication la plus récente.  |
| `pages_min` | entier, 1 à 100000                                                         | non    | Œuvre la plus courte acceptable.       |
| `pages_max` | entier, 1 à 100000                                                         | non    | Œuvre la plus longue acceptable.       |
| `sort`      | `relevance`, `rating`, `readers`, `newest` ou `oldest`, défaut `relevance` | non    | L'ordre des lignes.                    |
| `limit`     | entier, 1 à 50, défaut `10`                                                | non    | Lignes à servir.                       |
| `page`      | entier, 1 à 100, défaut `1`                                                | non    | Quelle page de lignes.                 |

**En retour :** `books`, chacun portant `title`, `authors`,
`first_published_year`, `edition_count`, `archive_identifiers` pour les
exemplaires numérisés que l'archive détient, `scan_count`, `page_count` comme
médiane sur les éditions, `subjects` et `source_url`. `searched_for` dit en mots
ce à quoi cette réponse répond, texte libre et chaque critère appliqué, et
`query` vaut `null` quand la recherche était faite de critères seuls. `total`
compte les œuvres correspondantes.

### `list_snapshots`

Liste les captures que la Wayback Machine garde d'une adresse.

| Argument | Type                           | Requis | Ce qu'il fait                                      |
| -------- | ------------------------------ | ------ | -------------------------------------------------- |
| `url`    | chaîne, 3 à 2000 caractères    | oui    | L'adresse à consulter.                             |
| `limit`  | entier, 1 à 100, défaut `20`   | non    | Captures à servir.                                 |
| `cursor` | chaîne, jusqu'à 500 caractères | non    | Le `next_cursor` nommé par une réponse précédente. |

**En retour :** `snapshots`, chacune avec son `captured_at` en horodatage ISO
UTC, l'`url` de la capture elle-même, et le `status` que la collecte a enregistré.
`first` et `last` décrivent cette réponse plutôt que tout l'historique, et
`next_cursor` poursuit la liste.

### `get_snapshot`

Lit une capture d'une adresse, à une date ou près d'elle.

| Argument | Type                           | Requis | Ce qu'il fait                                         |
| -------- | ------------------------------ | ------ | ----------------------------------------------------- |
| `url`    | chaîne, 3 à 2000 caractères    | oui    | L'adresse à consulter.                                |
| `at`     | `AAAA-MM-JJ` ou horodatage ISO | non    | La date visée. La capture la plus récente par défaut. |

**En retour :** la `snapshot` avec son `captured_at` et son adresse, à côté de
`requested_url` et `requested_at`, si bien que l'écart entre la date demandée et
la capture servie est visible. La Wayback Machine répond à une date dont elle n'a
aucune capture par la plus proche qu'elle détient.

## Ce que valent les extraits

Le texte contenu dans un document numérisé est issu de la reconnaissance optique
de caractères. Un passage porte donc les erreurs de lecture de ce procédé, et il
est servi tel qu'il a été lu plutôt que corrigé : un mot qui se lit bizarrement
est ce que la machine a vu. Citez un passage comme l'extrait d'une numérisation,
et liez le document pour qu'un lecteur puisse regarder la page.

## Configuration

Chaque variable est facultative. Elles se posent dans le bloc `env` de la
configuration du client.

| Variable                | Défaut               | Ce qu'elle fait                                                                        |
| ----------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `IA_USER_AGENT`         | l'identité du projet | Nomme votre application auprès de l'archive, avec une adresse où joindre une personne. |
| `IA_MIN_INTERVAL_MS`    | `1000`               | Écart entre deux requêtes, de 500 à 60000.                                             |
| `IA_TIMEOUT_MS`         | `20000`              | Délai d'une requête, de 1000 à 120000.                                                 |
| `IA_HISTORY_TIMEOUT_MS` | `60000`              | Délai d'un historique Wayback Machine, de 5000 à 180000.                               |
| `IA_MAX_RETRIES`        | `3`                  | Tentatives après un échec passager, de 0 à 8.                                          |
| `IA_CACHE_TTL_MS`       | `900000`             | Durée pendant laquelle une réponse reste en mémoire, de 0 à 86400000.                  |
| `IA_CACHE_MAX_ENTRIES`  | `200`                | Réponses gardées en mémoire à la fois, de 1 à 5000.                                    |
| `IA_LOG_LEVEL`          | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.                    |

Une valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                   | Que faire                                                                                          |
| --------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `not_found`     | L'archive a répondu, et n'a pas ce document.         | Vérifiez l'identifiant avec `search_items`.                                                        |
| `invalid_input` | Les arguments ont été refusés avant toute requête.   | Lisez le message, qui nomme l'argument.                                                            |
| `rate_limited`  | L'archive demande à ce client de ralentir.           | Attendez les secondes indiquées et rappelez avec les mêmes arguments. Le document est toujours là. |
| `parse_failure` | La réponse est arrivée dans une forme illisible ici. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-archiveorg/issues).         |
| `network_error` | La requête n'a pas abouti.                           | Réessayez sous peu.                                                                                |
| `timeout`       | La requête a dépassé son délai.                      | Augmentez `IA_TIMEOUT_MS`, ou `IA_HISTORY_TIMEOUT_MS` pour un historique.                          |

## Comme bibliothèque

La couche qui lit l'archive est publiée seule, avec son rythme, son cache et ses
erreurs, sans protocole attaché.

```ts
import { ArchiveClient } from "mcp-archiveorg/client";

const client = new ArchiveClient();
const { data, cached } = await client.searchItems({ query: "san francisco earthquake" });
console.log(data.total, cached);
```

Chaque lecture répond `{ data, cached }`, et lève une erreur portant un des six
codes. Le plancher entre deux requêtes tient également ici.

## Rythme et attribution

Les requêtes partent une à une avec au moins une seconde entre elles, et le
plancher d'une demi-seconde tient quelle que soit la configuration. Le
`User-Agent` se termine toujours par l'identité du projet et une adresse où
joindre une personne. L'Internet Archive est une bibliothèque à but non lucratif,
et une recherche dans le texte de ses documents est l'une des questions les plus
coûteuses qu'elle traite.

Chaque résultat porte l'adresse de la page d'où il a été lu. Les documents
appartiennent aux personnes et aux institutions qui les ont déposés, sous les
conditions que chaque fiche indique dans `license_url`.

Ce MCP est un projet non officiel, sans affiliation à l'Internet Archive.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `archive.org`, `web.archive.org` et `openlibrary.org`, garde ses réponses en mémoire le temps qu'il
tourne, et n'écrit rien sur le disque. [PRIVACY.md](PRIVACY.md) dit ce qu'une
requête emporte et quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre l'archive elle-même.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-archiveorg/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les documents appartiennent à ceux qui les ont
déposés, sous les conditions que chaque fiche indique.
