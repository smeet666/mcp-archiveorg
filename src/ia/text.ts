/**
 * Reading back text the source escaped.
 *
 * Metadata on the Internet Archive is typed into web forms, and some records
 * arrive with their characters written as HTML entities: a title filed as
 * "&Ecirc;tre libre avec Sartre" is one string standing for "Être libre avec
 * Sartre". Handing that on unread shows a caller markup the depositor never
 * meant to publish, so the escaping is undone wherever the source's own text
 * reaches a caller.
 *
 * This is the only transformation applied to that text. Nothing else about a
 * field is repaired: what optical recognition read off a scanned page is
 * repeated as it was read, misreadings included.
 */

/**
 * Named entities this server reads back.
 *
 * The table covers the Latin-1 letters and signs, which is what a form filled
 * in a European language produces, and the punctuation names that follow them.
 * A name outside the table is left standing rather than guessed at: a wrong
 * character is a worse answer than a visible escape.
 */
const NAMED: Readonly<Record<string, string>> = {
  quot: '"',
  amp: "&",
  apos: "'",
  lt: "<",
  gt: ">",
  // A few entries below are spaces and a soft hyphen, which show as nothing
  // here. Each holds the character its name stands for, not a plain space.
  nbsp: " ",
  iexcl: "¡",
  cent: "¢",
  pound: "£",
  curren: "¤",
  yen: "¥",
  brvbar: "¦",
  sect: "§",
  uml: "¨",
  copy: "©",
  ordf: "ª",
  laquo: "«",
  not: "¬",
  shy: "­",
  macr: "¯",
  deg: "°",
  plusmn: "±",
  sup2: "²",
  sup3: "³",
  acute: "´",
  micro: "µ",
  para: "¶",
  middot: "·",
  cedil: "¸",
  sup1: "¹",
  ordm: "º",
  raquo: "»",
  frac14: "¼",
  frac12: "½",
  frac34: "¾",
  iquest: "¿",
  Agrave: "À",
  Aacute: "Á",
  Acirc: "Â",
  Atilde: "Ã",
  Auml: "Ä",
  Aring: "Å",
  AElig: "Æ",
  Ccedil: "Ç",
  Egrave: "È",
  Eacute: "É",
  Ecirc: "Ê",
  Euml: "Ë",
  Igrave: "Ì",
  Iacute: "Í",
  Icirc: "Î",
  Iuml: "Ï",
  ETH: "Ð",
  Ntilde: "Ñ",
  Ograve: "Ò",
  Oacute: "Ó",
  Ocirc: "Ô",
  Otilde: "Õ",
  Ouml: "Ö",
  times: "×",
  Oslash: "Ø",
  Ugrave: "Ù",
  Uacute: "Ú",
  Ucirc: "Û",
  Uuml: "Ü",
  Yacute: "Ý",
  THORN: "Þ",
  szlig: "ß",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  aring: "å",
  aelig: "æ",
  ccedil: "ç",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  euml: "ë",
  igrave: "ì",
  iacute: "í",
  icirc: "î",
  iuml: "ï",
  eth: "ð",
  ntilde: "ñ",
  ograve: "ò",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  divide: "÷",
  oslash: "ø",
  ugrave: "ù",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
  yacute: "ý",
  thorn: "þ",
  yuml: "ÿ",
  OElig: "Œ",
  oelig: "œ",
  Scaron: "Š",
  scaron: "š",
  Yuml: "Ÿ",
  fnof: "ƒ",
  circ: "ˆ",
  tilde: "˜",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  dagger: "†",
  Dagger: "‡",
  bull: "•",
  hellip: "…",
  permil: "‰",
  prime: "′",
  Prime: "″",
  lsaquo: "‹",
  rsaquo: "›",
  euro: "€",
  trade: "™",
};

/**
 * An escape must end in a semicolon to be read as one.
 *
 * HTML tolerates "&amp" without it, and honouring that would rewrite "Q&A" and
 * every bare ampersand a title legitimately carries.
 */
const ESCAPE = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

/** A code point that names a character, as opposed to one that names nothing. */
function fromCodePoint(code: number): string | null {
  const named = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
  return named ? String.fromCodePoint(code) : null;
}

/**
 * Read an escaped string back to the characters it stands for.
 *
 * The whole string is walked once, so an escape produced by reading another one
 * is left alone: "&amp;Ecirc;" is a title carrying the seven characters
 * "&Ecirc;", and a second pass would turn it into a letter nobody typed.
 */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ESCAPE, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const digits = hex ? body.slice(2) : body.slice(1);
      return fromCodePoint(Number.parseInt(digits, hex ? 16 : 10)) ?? whole;
    }
    return NAMED[body] ?? whole;
  });
}
