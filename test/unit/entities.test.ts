/**
 * Text the Archive holds with its characters written as HTML entities.
 *
 * Depositors type metadata into web forms, and some of them arrive with the
 * accents escaped: a title filed as "&Ecirc;tre libre avec Sartre" is one
 * string standing for "Être libre avec Sartre". Reading it back is what the
 * depositor wrote, so the escaping is undone wherever the source's own text
 * reaches a caller.
 *
 * The boundary matters as much as the decoding. Undoing an escape twice invents
 * a character nobody typed, an unknown name is left as it stands rather than
 * guessed at, and a machine's misreading of a scanned page is not an escape and
 * is never touched.
 */

import { describe, expect, it } from "vitest";
import { decodeEntities } from "../../src/ia/text.js";
import { toBooks, toInsideResults, toItemDetail, toSearchResults } from "../../src/ia/parse.js";
import { skipCounter } from "./helpers.js";

const URL_UNDER_TEST = "https://archive.org/probe";

describe("an escaped character", () => {
  it("is read back from its name", () => {
    expect(decodeEntities("&Ecirc;tre libre avec Sartre")).toBe("Être libre avec Sartre");
    expect(decodeEntities("b&ucirc;cher")).toBe("bûcher");
    expect(decodeEntities("Sch&ouml;ffer")).toBe("Schöffer");
  });

  it("is read back from its number, in decimal or in hexadecimal", () => {
    expect(decodeEntities("&#201;dition")).toBe("Édition");
    expect(decodeEntities("&#x00C9;dition")).toBe("Édition");
    expect(decodeEntities("caf&#xe9;")).toBe("café");
  });

  it("is read back when it is punctuation rather than a letter", () => {
    expect(decodeEntities("Rome &amp; Juliet")).toBe("Rome & Juliet");
    expect(decodeEntities("&laquo;Huis clos&raquo;")).toBe("«Huis clos»");
    expect(decodeEntities("l&rsquo;enfer")).toBe("l’enfer");
  });
});

describe("what is left alone", () => {
  it("leaves an ampersand that escapes nothing", () => {
    expect(decodeEntities("AT&T Bell Laboratories")).toBe("AT&T Bell Laboratories");
    expect(decodeEntities("Q&A")).toBe("Q&A");
  });

  it("leaves a name it does not hold, rather than guessing at a character", () => {
    expect(decodeEntities("&notaname; &frobnicate;")).toBe("&notaname; &frobnicate;");
  });

  it("leaves a number that names no character", () => {
    expect(decodeEntities("&#0; &#1114112;")).toBe("&#0; &#1114112;");
  });

  it("reads an escape once, so a title holding a literal escape keeps it", () => {
    // "&amp;Ecirc;" is how a source writes the seven characters "&Ecirc;". Read
    // twice it would become "Ê", a letter the title does not carry.
    expect(decodeEntities("&amp;Ecirc;")).toBe("&Ecirc;");
    expect(decodeEntities("&amp;amp;")).toBe("&amp;");
    expect(decodeEntities("Fish &amp; Chips &amp; More")).toBe("Fish & Chips & More");
  });

  it("leaves text that carries no escape untouched", () => {
    expect(decodeEntities("Huis clos suivi de Les mouches")).toBe("Huis clos suivi de Les mouches");
    expect(decodeEntities("")).toBe("");
  });
});

describe("a catalogue row", () => {
  const rowWith = (fields: Record<string, unknown>) => ({
    response: {
      body: { hits: { total: 1, hits: [{ fields: { identifier: "an-item", ...fields } }] } },
    },
  });

  it("carries its title as the depositor meant it to read", () => {
    const { onSkip } = skipCounter();
    const results = toSearchResults(
      rowWith({ title: "&Ecirc;tre libre avec Sartre", creator: "Durand, Guillaume &amp; al." }),
      URL_UNDER_TEST,
      onSkip,
    );

    expect(results.items[0]?.title).toBe("Être libre avec Sartre");
    expect(results.items[0]?.creator).toBe("Durand, Guillaume & al.");
  });

  it("keeps the identifier exactly as the Archive addresses it", () => {
    const { onSkip } = skipCounter();
    const results = toSearchResults(
      rowWith({ identifier: "manualzilla-id-6519057", title: "x" }),
      URL_UNDER_TEST,
      onSkip,
    );

    expect(results.items[0]?.identifier).toBe("manualzilla-id-6519057");
    expect(results.items[0]?.sourceUrl).toContain("manualzilla-id-6519057");
  });
});

describe("a full-text match", () => {
  const insideWith = (fields: Record<string, unknown>, text: string[]) => ({
    response: {
      body: {
        hits: {
          total: 1,
          hits: [{ fields: { identifier: "an-item", ...fields }, highlight: { text } }],
        },
      },
    },
  });

  it("carries its title as the depositor meant it to read", () => {
    const { onSkip } = skipCounter();
    const results = toInsideResults(
      insideWith({ title: "&Ecirc;tre libre avec Sartre" }, ["a passage"]),
      URL_UNDER_TEST,
      onSkip,
    );

    expect(results.hits[0]?.title).toBe("Être libre avec Sartre");
  });

  it("leaves a machine's misreading of a scanned page exactly as it was read", () => {
    // "bicher" where the page says "bûcher" is optical recognition, not an
    // escape. Repairing it would put words on a page that are not there.
    const { onSkip } = skipCounter();
    const results = toInsideResults(
      insideWith({ title: "Huis clos" }, ["bicher, le gril... Ah! quelle plaisan- terie."]),
      URL_UNDER_TEST,
      onSkip,
    );

    expect(results.hits[0]?.excerpts[0]).toBe("bicher, le gril... Ah! quelle plaisan- terie.");
  });
});

describe("an item record", () => {
  it("carries every field the source wrote as text", () => {
    const detail = toItemDetail(
      {
        metadata: {
          title: "&Ecirc;tre libre avec Sartre",
          creator: ["Durand, Guillaume &amp; al."],
          description: "Un texte sur l&rsquo;enfer.",
          publisher: "Sch&ouml;ffer, Peter",
        },
        files: [],
      },
      "an-item",
      URL_UNDER_TEST,
    );

    expect(detail.title).toBe("Être libre avec Sartre");
    expect(detail.creator).toBe("Durand, Guillaume & al.");
    expect(detail.description).toBe("Un texte sur l’enfer.");
    expect(detail.publisher).toBe("Schöffer, Peter");
  });
});

describe("a work from the book catalogue", () => {
  it("carries its title, its authors and its subjects as written", () => {
    const { onSkip } = skipCounter();
    const { books } = toBooks(
      {
        numFound: 1,
        docs: [
          {
            key: "/works/OL1W",
            title: "Le C&oelig;ur simple",
            author_name: ["Gustave Flaubert &amp; al."],
            subject: ["&Eacute;ducation"],
          },
        ],
      },
      URL_UNDER_TEST,
      onSkip,
    );

    expect(books[0]?.title).toBe("Le Cœur simple");
    expect(books[0]?.authors).toEqual(["Gustave Flaubert & al."]);
    expect(books[0]?.subjects).toEqual(["Éducation"]);
  });
});

describe("a name written in another case", () => {
  it("is read back when only one character answers to it", () => {
    // A form fills in "&Amp;" as readily as "&amp;", and both stand for the
    // one character an ampersand escapes.
    expect(decodeEntities("Rome &Amp; Juliet")).toBe("Rome & Juliet");
    expect(decodeEntities("Rome &AMP; Juliet")).toBe("Rome & Juliet");
    expect(decodeEntities("Fish&NBSP;and chips")).toBe("Fish and chips");
  });

  it("is left standing when the case is what picks the character", () => {
    // "Egrave" and "egrave" name a capital and a small letter, so a spelling
    // that matches neither is a spelling this server cannot resolve, and a
    // wrong letter reads worse than a visible escape.
    expect(decodeEntities("&EGRAVE;tre")).toBe("&EGRAVE;tre");
    expect(decodeEntities("&eGrave;tre")).toBe("&eGrave;tre");
  });
});

describe("text whose escapes stand at its edges", () => {
  const rowWith = (fields: Record<string, unknown>) => ({
    response: {
      body: { hits: { total: 1, hits: [{ fields: { identifier: "an-item", ...fields } }] } },
    },
  });

  it("ends where its words end", () => {
    // A record padded with "&nbsp;" carries a title of the words before it:
    // the padding is invisible in every client and leaves a row that reads as
    // though its title were cut off.
    const { onSkip } = skipCounter();
    const results = toSearchResults(
      rowWith({
        title: "Mahakavi Akbar &nbsp;&nbsp;",
        creator: "&nbsp;Raguraj Kishore Vatan&nbsp;",
      }),
      URL_UNDER_TEST,
      onSkip,
    );

    expect(results.items[0]?.title).toBe("Mahakavi Akbar");
    expect(results.items[0]?.creator).toBe("Raguraj Kishore Vatan");
  });

  it("says what the record filed, so a row keeps the evidence of its match", () => {
    // A search for "nbsp" matches these records on the escape itself, and the
    // title handed back holds the character the escape stands for. Nothing on
    // the row then shows why it is in the list.
    const { onSkip } = skipCounter();
    const results = toSearchResults(
      rowWith({ title: "Mahakavi Akbar &nbsp;&nbsp;" }),
      URL_UNDER_TEST,
      onSkip,
    );

    expect(results.items[0]?.titleAsFiled).toBe("Mahakavi Akbar &nbsp;&nbsp;");
  });

  it("holds nothing extra when reading the title changed nothing", () => {
    const { onSkip } = skipCounter();
    const results = toSearchResults(rowWith({ title: "Moby Dick" }), URL_UNDER_TEST, onSkip);

    expect(
      results.items[0]?.titleAsFiled,
      "a duplicate of the title is a field that lies by weight",
    ).toBeNull();
  });
});
