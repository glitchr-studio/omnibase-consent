# Consent

The cookie answer of the [omnibase](https://github.com/glitchr-studio/omnibase)
sites, written once: a small circle that opens a panel - what the site keeps,
**accept**, **refuse** - instead of a copy of the same controller in every site.

- A visitor who has not answered sees the panel float at the bottom of the
  screen with a countdown (`consent.countdown`, 10 s): no answer is a yes,
  and so is a click elsewhere. The site keeps only what makes it work.
- The answer is kept the way [`@glitchr/cookie`](https://gitlab.glitchr.dev/public-repository/javascript/cookie)
  keeps it (`localStorage` `cookie/<GROUP>`), through `window.Cookie`, which
  omnibase loads on every page: a refusal deletes the groups' cookies
  (`USER/*`: theme, language, time zone...) and keeps them from coming back.
- **Feature by feature.** Whatever keeps cookies - the site itself (`USER`),
  a chat, a measure of audience, Instagram - is a *feature* with its own switch
  under "Choisir". **D'accord** turns them all on, **Refuser** all off, waiting
  only the site's own (`implicit`): a tracker never starts without a yes.
- Anything with `data-consent-open` opens the panel - a "Cookies" entry of a
  sitemap, a link of the privacy page.
- No dependency: a plain script (`bundles/consent/js/consent.js`) that
  watches the page, so transparent.js or Turbo page swaps need nothing.

## Install

```bash
composer require omnibase/consent:dev-main
```

```php
// config/bundles.php
Base\Consent\ConsentBundle::class => ['all' => true],
```

```twig
{# where the circle goes: a footer, a tool bar #}
{% include '@Consent/_cookie.html.twig' with {place: 'footer'} %}

{# elsewhere on the page #}
<button type="button" data-consent-open>Cookies</button>
```

## Configure

```yaml
# config/packages/consent.yaml
consent:
    groups: [USER]               # @glitchr/cookie groups; the first tells whether the visitor answered
    countdown: 10                # seconds before no answer counts as yes; 0 = wait for an answer
    privacy_route: app_privacy   # linked from the panel; null or a missing route leaves the link out
    privacy_route_parameters: {} # e.g. {slug: vie-privee} when a generic route serves the page
    erase_on_refuse: []          # other cookies to delete on a refusal, by name prefix (e.g. crisp-client)
    features:                    # the others, each with its switch; off until the visitor says yes
        CHAT: { erase: [crisp-client] }
        ANALYTICS: ~
        SOCIAL: ~                # omnibase/social loads Instagram on the `social:consent` event this sends
        # implicit: true  -> on when the visitor does not answer (only for what the site needs)
        # required: true  -> always on, its switch locked
```

Labels and descriptions are the translations `consent.features.<name>.label`
and `.description`; the bundle has words for `user`, `chat`, `analytics` and
`social` in five languages, a site adds or rewords its own.

The words are in the `consent` translation domain (fr, en, de, it, ja): a site
overrides any of them in its own `translations/consent+intl-icu.<locale>.yaml`.

## Look

`bundles/consent/css/consent.css`, themed by custom properties set anywhere
above the circle:

```css
:root {
    --consent-ink: #1c2b3a;   --consent-soft: #66727f;
    --consent-bg: #fff;       --consent-line: rgba(0, 0, 0, .14);
    --consent-accent: #24447c; --consent-on-accent: #fff;
    --consent-danger: #c0392b; --consent-hover: rgba(0, 0, 0, .07);
    --consent-radius: 14px;   --consent-font: inherit;
    --consent-shadow: 0 12px 30px rgba(0, 0, 0, .16);
    --consent-size: 2rem;
}
```

## In a script

A script does not decide on cookies itself: it subscribes to its feature,
and the panel decides.

```js
// Declares the feature (its switch appears in the panel), runs the first
// function when it is on - now, or the moment the visitor says yes - and
// the second when it goes off. Returns whether it is on now.
window.Consent.use('CHAT', { label: 'The chat' }, () => loadCrisp(), () => window.$crisp?.push(['do', 'chat:hide']));

// A cookie through the answer: nothing is written while ANALYTICS is off.
window.Consent.cookie('ANALYTICS', 'VISITOR_ID', id, 30 * 24 * 3600);
```

`@glitchr/cookie`'s `Cookie.set(group, ...)` is superseded the same way:
any group a script writes becomes a feature of the panel, and stays
unwritten while it is off. Markup can wait too:

```html
<script type="text/plain" data-consent-script="ANALYTICS" data-src="https://..."></script>
<iframe data-consent-script="SOCIAL" data-consent-src="https://www.instagram.com/p/.../embed"></iframe>
```

The rest of the API:

```js
window.Consent.state('CHAT')    // true | false | null (not answered)
window.Consent.enabled('CHAT')  // what to do now: an implicit feature is on until refused
window.Consent.features()       // every feature, its label and state
window.Consent.refused()        // the site's own cookies refused, e.g. before writing a preference
window.Consent.accept(); window.Consent.refuse(); window.Consent.open();
window.addEventListener('consent:change', (e) => e.detail.features); // {USER: true, CHAT: false...}
document.addEventListener('chat:consent', () => {});               // a feature just turned on
```
