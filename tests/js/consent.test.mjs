// npm install && npm test   (node --test "tests/js/*.test.mjs"; needs jsdom)
//
// consent.js on a page whose circle loses its panel, or goes away: a page
// swap (transparent.js, Turbo) empties the bar it sat in, a script rebuilds a
// footer. close() used to throw there ("Cannot set properties of null"), from
// an answer, a click elsewhere or Escape.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const script = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../public/js/consent.js'), 'utf8');

const circle = (place) => `
<div class="ga-cookie" data-consent data-consent-features='[{"name":"USER","implicit":true},{"name":"CHAT"}]' data-consent-countdown="0" id="circle-${place}">
    <button type="button" data-consent-toggle aria-expanded="false" data-accepted-label="ok" data-refused-label="no"></button>
    <div class="ga-cookie-panel" id="ga-cookie-${place}" hidden>
        <ul class="ga-cookie-features" hidden></ul>
        <button type="button" data-consent-accept></button>
        <button type="button" data-consent-refuse></button>
        <button type="button" data-consent-details hidden></button>
        <button type="button" data-consent-save hidden></button>
    </div>
</div>`;

/** A page with these circles, consent.js started on it (it starts once the document is parsed). */
async function page(body) {
    const errors = [];
    const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { runScripts: 'outside-only', url: 'https://example.test/' });
    dom.window.addEventListener('error', (event) => errors.push(event.error || event.message));
    dom.window.eval(script);
    if (dom.window.document.readyState === 'loading') {
        await new Promise((resolve) => dom.window.document.addEventListener('DOMContentLoaded', resolve));
    }

    return { window: dom.window, document: dom.window.document, Consent: dom.window.Consent, errors };
}

const click = (window, element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

test('an answer closes the circles, one of which lost its panel', async () => {
    const { document, Consent, errors } = await page(circle('bar') + circle('footer'));
    document.querySelector('#ga-cookie-footer').remove();

    assert.doesNotThrow(() => Consent.accept());
    assert.deepEqual(errors, []);
    assert.equal(Consent.state('USER'), true);
    assert.equal(Consent.state('CHAT'), true);
    assert.equal(document.querySelector('#ga-cookie-bar').hidden, true);
});

test('an answer after the circle left the page', async () => {
    const { document, Consent, errors } = await page(circle('bar'));
    const widget = document.querySelector('#circle-bar');
    widget.querySelector('.ga-cookie-panel').remove();
    widget.remove();

    assert.doesNotThrow(() => Consent.refuse());
    assert.doesNotThrow(() => Consent.open());
    assert.doesNotThrow(() => Consent.close());
    assert.deepEqual(errors, []);
    assert.equal(Consent.state('USER'), false);
});

test('a click elsewhere and Escape, the panel gone', async () => {
    const { window, document, Consent, errors } = await page(circle('bar') + '<main id="elsewhere"></main><a data-consent-open id="link"></a>');
    Consent.accept(); // answered: the circle no longer floats
    document.querySelector('#ga-cookie-bar').remove();

    click(window, document.querySelector('#elsewhere'));
    click(window, document.querySelector('#link'));
    click(window, document.querySelector('[data-consent-toggle]'));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    assert.deepEqual(errors, []);
});

test('the panel still opens and closes', async () => {
    const { window, document, Consent } = await page(circle('bar'));
    Consent.accept();
    const panel = document.querySelector('#ga-cookie-bar');
    const toggle = document.querySelector('[data-consent-toggle]');

    click(window, toggle);
    assert.equal(panel.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');

    Consent.close();
    assert.equal(panel.hidden, true);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');

    Consent.open();
    assert.equal(panel.hidden, false);
    click(window, toggle);
    assert.equal(panel.hidden, true);
});
