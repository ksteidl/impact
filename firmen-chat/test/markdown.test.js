import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../public/js/markdown.js';

test('escaped HTML vollständig', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> **fett** <script>x</script>');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(html.includes('<strong>fett</strong>'));
});

test('Links nur mit http(s)', () => {
  assert.ok(!renderMarkdown('[x](javascript:alert(1))').includes('<a'));
  assert.ok(renderMarkdown('[Doku](https://example.com/a?b=1&c=2)').includes('href="https://example.com/a?b=1&amp;c=2"'));
  assert.ok(!renderMarkdown('[x](https://e.com/"onmouseover="alert(1))').includes('" onmouseover'));
});

test('Codeblock, Liste, Tabelle', () => {
  const html = renderMarkdown('- a\n- b\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nlet a = "<b>";\n```');
  assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<th>A<\/th>/);
  assert.match(html, /&lt;b&gt;/);
});
