// Datenschutz-Filter (DLP): schwärzt personenbezogene Daten, bevor Text an
// externe (nicht lokale) Anbieter gesendet wird.

function luhnValid(digits: string) {
  let sum = 0
  let dbl = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (dbl) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    dbl = !dbl
  }
  return sum % 10 === 0
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

type Rule = { label: string; re: RegExp; check?: (m: string) => boolean }

const RULES: Rule[] = [
  { label: "E-MAIL", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { label: "IBAN", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g },
  {
    label: "KARTENNUMMER",
    re: /\b(?:\d[ -]?){13,19}\b/g,
    check: (m) => {
      const d = m.replace(/\D/g, "")
      return d.length >= 13 && d.length <= 19 && luhnValid(d)
    },
  },
  { label: "TELEFON", re: /(?<![\w])(?:\+|00)\d{1,3}[ /.-]?(?:\(?\d{1,5}\)?[ /.-]?){2,5}\d{2,}(?![\w])/g },
  { label: "TELEFON", re: /(?<![\w\d])0\d{2,5}[ /-]\d{3,}(?:[ -]\d{2,})*(?![\w\d])/g },
  // Österreichische Sozialversicherungsnummer (z. B. "1234 010180")
  { label: "SVNR", re: /\b\d{4}[ ]?(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{2}\b/g },
]

export function redact(text: string, { terms = [] as string[] } = {}) {
  let count = 0
  let out = text
  for (const term of terms) {
    if (!term) continue
    out = out.replace(new RegExp(escapeRegex(term), "gi"), () => {
      count++
      return "[VERTRAULICH]"
    })
  }
  for (const rule of RULES) {
    out = out.replace(rule.re, (m) => {
      if (rule.check && !rule.check(m)) return m
      count++
      return `[${rule.label}]`
    })
  }
  return { text: out, count }
}

export function findBlockedTerm(text: string, terms: string[]) {
  const lower = text.toLowerCase()
  return terms.find((t) => t && lower.includes(t.toLowerCase())) ?? null
}

export function splitLines(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}
