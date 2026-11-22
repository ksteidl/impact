import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, findBlockedTerm, splitLines } from '../src/dlp.js';

test('schwärzt E-Mail, IBAN, Telefon, Kreditkarte', () => {
  const r = redact('Mail max@firma.at, IBAN AT61 1904 3002 3457 3201, Tel +43 664 1234567, Karte 4111 1111 1111 1111');
  assert.equal(r.text, 'Mail [E-MAIL], IBAN [IBAN], Tel [TELEFON], Karte [KARTENNUMMER]');
  assert.equal(r.count, 4);
});

test('lässt normale Zahlen und Text in Ruhe', () => {
  const src = 'Umsatz 2025 stieg um 12 % auf 1.250.000 EUR. Version 3.2.1';
  assert.deepEqual(redact(src), { text: src, count: 0 });
});

test('keine Kartennummer ohne gültige Luhn-Prüfsumme', () => {
  assert.equal(redact('Bestellung 1234 5678 9012 3456').text.includes('KARTENNUMMER'), false);
});

test('eigene Begriffe werden unabhängig von Groß-/Kleinschreibung geschwärzt', () => {
  const r = redact('Kunde ACME GmbH und acme gmbh', { terms: ['Acme GmbH'] });
  assert.equal(r.text, 'Kunde [VERTRAULICH] und [VERTRAULICH]');
});

test('gesperrte Begriffe werden erkannt', () => {
  assert.equal(findBlockedTerm('Status zu PROJEKT FALKE?', splitLines('Projekt Falke\n\n')), 'Projekt Falke');
  assert.equal(findBlockedTerm('Hallo', ['Falke']), null);
});
