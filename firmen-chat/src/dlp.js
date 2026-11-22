// Datenschutz-Filter (DLP): schwärzt personenbezogene Daten, bevor Text an
// externe (nicht lokale) Anbieter gesendet wird. Die Originalnachricht bleibt
// nur lokal gespeichert.

function luhnValid(digits) {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const RULES = [
  { label: 'E-MAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // IBAN (z. B. AT61 1904 3002 3457 3201, DE89 3704 0044 0532 0130 00)
  { label: 'IBAN', re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g },
  {
    label: 'KARTENNUMMER',
    re: /\b(?:\d[ -]?){13,19}\b/g,
    check: (m) => {
      const d = m.replace(/\D/g, '');
      return d.length >= 13 && d.length <= 19 && luhnValid(d);
    },
  },
  // Telefonnummern im internationalen oder nationalen Format
  { label: 'TELEFON', re: /(?<![\w])(?:\+|00)\d{1,3}[ /.-]?(?:\(?\d{1,5}\)?[ /.-]?){2,5}\d{2,}(?![\w])/g },
  { label: 'TELEFON', re: /(?<![\w\d])0\d{2,5}[ /-]\d{3,}(?:[ -]\d{2,})*(?![\w\d])/g },
  // Österreichische Sozialversicherungsnummer (10 Ziffern, oft "1234 010180")
  { label: 'SVNR', re: /\b\d{4}[ ]?(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{2}\b/g },
];

/**
 * @param {string} text
 * @param {{ terms?: string[] }} opts
 * @returns {{ text: string, count: number }}
 */
export function redact(text, { terms = [] } = {}) {
  let count = 0;
  let out = text;
  for (const term of terms) {
    if (!term) continue;
    const re = new RegExp(escapeRegex(term), 'gi');
    out = out.replace(re, () => {
      count++;
      return '[VERTRAULICH]';
    });
  }
  for (const rule of RULES) {
    out = out.replace(rule.re, (m) => {
      if (rule.check && !rule.check(m)) return m;
      count++;
      return `[${rule.label}]`;
    });
  }
  return { text: out, count };
}

export function findBlockedTerm(text, terms) {
  const lower = text.toLowerCase();
  return terms.find((t) => t && lower.includes(t.toLowerCase())) || null;
}

export function splitLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
