/*
 * omnibase/consent - the cookie answer of an omnibase site, feature by
 * feature, no dependency.
 *
 * A FEATURE is whatever keeps cookies under one @glitchr/cookie group: the
 * site's own (USER: session, language, theme), a chat (CHAT), a measure of
 * audience (ANALYTICS), Instagram (SOCIAL)... Each has a switch in the panel
 * (under "Choisir"), and its answer is kept the way @glitchr/cookie keeps it
 * (localStorage "cookie/<GROUP>" = true | false), through window.Cookie when
 * the page has it - so turning a feature off also deletes its cookies.
 *
 * Features come from three places:
 *   - the configuration (consent.groups, consent.features), handed by the
 *     partial in data-consent-features;
 *   - the scripts, as they run:
 *       Consent.use('CHAT', {label: 'Chat'}, () => loadCrisp(), () => hideCrisp());
 *     declares the feature (its switch appears) and runs the first function
 *     when it is on - now or once the visitor says yes - the second when it
 *     goes off;
 *   - any script writing a cookie through @glitchr/cookie: Cookie.set(group, ...)
 *     is superseded, so an unknown group becomes a feature with its switch,
 *     and nothing is written while that feature is off.
 *   Elements wait for a feature too: <script type="text/plain"
 *   data-consent-script="ANALYTICS" data-src="..."> runs, and
 *   <iframe data-consent-script="SOCIAL" data-consent-src="..."> loads, once on.
 *
 * Not answered yet: the first circle of the page floats its panel at the
 * bottom of the screen and counts down (data-consent-countdown seconds). At 0,
 * or on a click elsewhere, the implicit features (the site's own) go on and
 * the others stay off. D'accord turns every feature on, Refuser every one off
 * (but a required one), "Enregistrer mes choix" keeps the switches as set.
 *
 *   Consent.state(name)    true | false | null (not answered)
 *   Consent.enabled(name)  what a script should do now (an implicit feature is on until refused)
 *   Consent.use(name, options, onEnable, onDisable)
 *   Consent.cookie(group, name, value, expires)   Cookie.set() through the answer
 *   Consent.undecided()  Consent.refused()  Consent.accepted()   (the site's own feature)
 *   Consent.accept()  Consent.refuse()  Consent.open()  Consent.features()
 *
 * Every answer dispatches `consent:change` on window ({detail: {consent,
 * groups, features}}), `ga:cookie` for the sites written before this bundle,
 * and, for each feature turned on, `<name>:consent` on the document (the
 * social bundle loads Instagram on `social:consent`) - sent again for every
 * feature already on, at load and after each page swap.
 */
(function () {
    'use strict';
    if (window.Consent) return;

    var STORE = 'cookie/';
    var ANSWERED = 'consent/answered';
    var widgets = [];
    var features = {};   // NAME -> {name, label, description, implicit, required, erase, on: [], off: []}
    var order = [];
    var floating = null;
    var timer = null;
    var labels = {};     // NAME -> {label, description}: the site's words for features scripts may declare

    function upper(name) { return String(name || '').trim().toUpperCase(); }

    function storage(read) {
        try { return read(window.localStorage); } catch (e) { return undefined; }
    }

    function stored(name) {
        var value = storage(function (s) { return s.getItem(STORE + name); });
        if (value === null || value === undefined) return null;
        return value === 'true' || value === true;
    }

    function primary() {
        for (var i = 0; i < order.length; i++) if (features[order[i]].implicit) return order[i];
        return order[0] || 'USER';
    }

    /** true | false | null: what the visitor answered for this feature. */
    function state(name) {
        name = upper(name) || primary();
        var value = stored(name);
        if (value !== null) return value;
        return features[name] && features[name].required ? true : null;
    }

    /** What a script should do now: an implicit feature is on until refused, any other off until accepted. */
    function enabled(name) {
        name = upper(name) || primary();
        var value = state(name);
        if (value !== null) return value;
        return !!(features[name] && features[name].implicit);
    }

    function answered() {
        return storage(function (s) { return s.getItem(ANSWERED); }) != null || stored(primary()) !== null;
    }

    function declare(definition) {
        var name = upper(definition.name);
        if (!name) return null;
        var feature = features[name];
        if (!feature) {
            feature = features[name] = { name: name, label: name.charAt(0) + name.slice(1).toLowerCase(), description: '', implicit: false, required: false, erase: [], on: [], off: [] };
            order.push(name);
        }
        ['label', 'description'].forEach(function (key) {
            var words = definition[key] || (labels[name] && labels[name][key]);
            // The site's translations win over a script's own words, which win over the bare name.
            if (labels[name] && labels[name][key]) words = labels[name][key];
            if (words) feature[key] = words;
        });
        ['implicit', 'required'].forEach(function (key) { if (typeof definition[key] === 'boolean') feature[key] = definition[key]; });
        if (Array.isArray(definition.erase)) definition.erase.forEach(function (prefix) { if (feature.erase.indexOf(prefix) < 0) feature.erase.push(prefix); });
        widgets.forEach(rows);
        return feature;
    }

    // ── The panel ───────────────────────────────────────────────────

    function panel(widget) { return widget.querySelector('.ga-cookie-panel'); }

    /** On screen for the visitor: not in a hidden footer, a folded bar (display, visibility, opacity). */
    function visible(element) {
        if (!element || !element.isConnected) return false;
        if (typeof element.checkVisibility === 'function') return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    }

    /** The first circle the visitor can see, else the first. */
    function front() {
        var connected = widgets.filter(function (w) { return w.isConnected; });
        return connected.filter(visible)[0] || connected[0];
    }
    function button(widget) { return widget.querySelector('[data-consent-toggle]'); }

    function open(widget) {
        widget = widget || front();
        if (!widget) return;
        panel(widget).hidden = false;
        button(widget).setAttribute('aria-expanded', 'true');
    }

    function close(widget) {
        panel(widget).hidden = true;
        button(widget).setAttribute('aria-expanded', 'false');
        choosing(widget, false);
    }

    /** One switch per feature; a required one is locked on. */
    function rows(widget) {
        var list = widget.querySelector('.ga-cookie-features');
        if (!list) return;
        order.forEach(function (name) {
            var feature = features[name];
            var input = list.querySelector('[data-consent-feature="' + name + '"]');
            if (!input) {
                var row = document.createElement('li');
                row.className = 'ga-cookie-feature';
                var label = document.createElement('label');
                input = document.createElement('input');
                input.type = 'checkbox';
                input.setAttribute('data-consent-feature', name);
                var text = document.createElement('span');
                text.className = 'ga-cookie-feature-text';
                var title = document.createElement('strong');
                text.appendChild(title);
                var small = document.createElement('small');
                text.appendChild(small);
                label.appendChild(input);
                label.appendChild(text);
                row.appendChild(label);
                list.appendChild(row);
            }
            var texts = input.parentNode.querySelector('.ga-cookie-feature-text');
            texts.firstChild.textContent = feature.label;
            texts.lastChild.textContent = feature.description || '';
            input.disabled = feature.required;
            if (!widget.classList.contains('is-choosing')) input.checked = enabled(name);
        });
        var details = widget.querySelector('[data-consent-details]');
        if (details) details.hidden = order.length < 2;
    }

    function choosing(widget, on) {
        widget.classList.toggle('is-choosing', on);
        var list = widget.querySelector('.ga-cookie-features');
        if (list) list.hidden = !on;
        var save = widget.querySelector('[data-consent-save]');
        if (save) save.hidden = !on;
        var details = widget.querySelector('[data-consent-details]');
        if (details) details.setAttribute('aria-expanded', on ? 'true' : 'false');
        if (on) {
            // Choosing is answering: no countdown behind the visitor's back.
            clearTimeout(timer);
            rows(widget);
        }
    }

    function render(widget) {
        var refused = state() === false;
        widget.classList.toggle('is-refused', refused);
        var b = button(widget);
        b.title = b.dataset[refused ? 'refusedLabel' : 'acceptedLabel'] || '';
        rows(widget);
    }

    function countdown(widget, left) {
        widget.querySelectorAll('.ga-cookie-count').forEach(function (count) {
            count.textContent = String(left);
            count.classList.remove('is-tick');
            void count.offsetWidth; // the number pops at every second
            count.classList.add('is-tick');
        });
        timer = setTimeout(function () {
            if (!widget.isConnected || answered() || widget.classList.contains('is-choosing')) return;
            // No answer counts only for a question the visitor could read: hidden
            // (its bar folded, another tab), the count waits where it is.
            if (document.hidden || !visible(panel(widget))) return countdown(widget, left);
            if (left > 0) countdown(widget, left - 1); else decide(implicitChoice());
        }, left > 0 ? 1000 : 600);
    }

    function float(widget) {
        floating = widget;
        widget.classList.add('is-floating');
        open(widget);
        var seconds = parseInt(widget.dataset.consentCountdown || '0', 10);
        if (seconds > 0) countdown(widget, seconds);
    }

    // ── Answers ─────────────────────────────────────────────────────

    function choice(fn) {
        var map = {};
        order.forEach(function (name) { map[name] = features[name].required ? true : fn(features[name]); });
        return map;
    }
    function implicitChoice() { return choice(function (f) { return f.implicit; }); }

    function eraseCookies(prefixes) {
        if (!prefixes.length) return;
        document.cookie.split(';').map(function (c) { return c.trim().split('=')[0]; })
            .filter(function (name) { return name && prefixes.some(function (prefix) { return name.indexOf(prefix) === 0; }); })
            .forEach(function (name) { document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'; });
    }

    function globalErase() {
        var widget = widgets[0];
        try { return JSON.parse((widget && widget.dataset.consentErase) || '[]'); } catch (e) { return []; }
    }

    function decide(map) {
        var before = {};
        order.forEach(function (name) { before[name] = enabled(name); });
        var cookie = window.Cookie && typeof window.Cookie.setConsent === 'function' ? window.Cookie : null;

        Object.keys(map).forEach(function (name) {
            var consent = !!map[name];
            // One group at a time: given a list, setConsent() files the list as one group.
            if (cookie) cookie.setConsent(consent, name);
            else storage(function (s) { s.setItem(STORE + name, String(consent)); });
            if (!consent) eraseCookies(features[name] ? features[name].erase : []);
        });
        if (map[primary()] === false) eraseCookies(globalErase());
        storage(function (s) { s.setItem(ANSWERED, new Date().toISOString()); });

        clearTimeout(timer);
        floating = null;
        widgets.forEach(function (widget) {
            widget.classList.remove('is-floating');
            close(widget);
            render(widget);
        });

        var now = {};
        order.forEach(function (name) {
            now[name] = enabled(name);
            if (now[name] === before[name]) return;
            (now[name] ? features[name].on : features[name].off).forEach(run);
            if (now[name]) {
                wake(name);
                document.dispatchEvent(new CustomEvent(name.toLowerCase() + ':consent'));
            }
        });
        window.dispatchEvent(new CustomEvent('consent:change', { detail: { consent: now[primary()], groups: order.slice(), features: now } }));
        window.dispatchEvent(new Event('ga:cookie'));
    }

    function run(fn) {
        try { fn(); } catch (e) { if (window.console) console.error(e); }
    }

    /** The elements waiting for a feature: <script type="text/plain" data-consent-script>, [data-consent-src]. */
    function wake(name, root) {
        (root || document).querySelectorAll('[data-consent-script="' + name + '"]').forEach(function (element) {
            if (element.dataset.consentAwake) return;
            element.dataset.consentAwake = '1';
            if (element.tagName === 'SCRIPT') {
                var script = document.createElement('script');
                Array.prototype.forEach.call(element.attributes, function (attribute) {
                    if (attribute.name !== 'type' && attribute.name !== 'data-src') script.setAttribute(attribute.name, attribute.value);
                });
                if (element.dataset.src) script.src = element.dataset.src;
                if (element.dataset.type) script.type = element.dataset.type;
                script.text = element.text;
                element.parentNode.replaceChild(script, element);
            } else if (element.dataset.consentSrc) {
                element.src = element.dataset.consentSrc;
            }
        });
    }

    // ── For scripts ─────────────────────────────────────────────────

    function use(name, options, onEnable, onDisable) {
        if (typeof options === 'function') { onDisable = onEnable; onEnable = options; options = {}; }
        var feature = declare(Object.assign({}, options || {}, { name: name }));
        if (!feature) return false;
        if (onEnable) feature.on.push(onEnable);
        if (onDisable) feature.off.push(onDisable);
        if (enabled(feature.name) && onEnable) run(onEnable);
        return enabled(feature.name);
    }

    /** @glitchr/cookie's Cookie.set(), superseded: an unknown group becomes a feature, nothing is written while it is off. */
    function supersede() {
        var cookie = window.Cookie;
        if (!cookie || typeof cookie.set !== 'function' || cookie.__consent) return;
        var set = cookie.set;
        cookie.set = function (group) {
            var name = upper(group);
            if (!features[name]) declare({ name: name });
            if (!enabled(name)) return undefined;
            return set.apply(cookie, arguments);
        };
        cookie.__consent = true;
    }

    function writeCookie(group, name, value, expires) {
        var feature = upper(group);
        if (!features[feature]) declare({ name: feature });
        if (!enabled(feature)) return false;
        supersede();
        if (window.Cookie && typeof window.Cookie.set === 'function') {
            window.Cookie.set(feature, name, value, expires);
        } else {
            var age = typeof expires === 'number' ? '; max-age=' + expires : '';
            document.cookie = feature + '/' + upper(name) + '=' + encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : value) + '; path=/' + age + '; SameSite=Lax';
        }
        return true;
    }

    // ── Circles on the page ─────────────────────────────────────────

    function adopt(widget) {
        if (widget.dataset.consentReady) return;
        widget.dataset.consentReady = '1';
        try {
            var known = JSON.parse(widget.dataset.consentLabels || '{}');
            Object.keys(known).forEach(function (name) {
                labels[name] = known[name];
                if (features[name]) declare({ name: name }); // declared by a script before the circle came
            });
        } catch (e) { /* no words: names */ }
        var list = [];
        try { list = JSON.parse(widget.dataset.consentFeatures || '[]'); } catch (e) { list = []; }
        if (!list.length) {
            // A partial from before the features: its groups are the site's own.
            try { list = JSON.parse(widget.dataset.consentGroups || '["USER"]').map(function (n) { return { name: n, implicit: true }; }); } catch (e) { list = [{ name: 'USER', implicit: true }]; }
        }
        list.forEach(declare);
        widgets.push(widget);
        render(widget);
    }

    /** Not answered: one circle floats its panel - the first the visitor can see, among those allowed to. */
    function ask() {
        if (answered() || (floating && floating.isConnected)) return;
        var candidates = widgets.filter(function (w) { return w.isConnected && w.dataset.consentFloating !== 'false'; });
        var widget = candidates.filter(visible)[0] || candidates[0];
        if (widget) float(widget);
    }

    function scan(root) {
        widgets = widgets.filter(function (widget) { return widget.isConnected; });
        if (floating && !floating.isConnected) { floating = null; clearTimeout(timer); }
        (root || document).querySelectorAll('[data-consent]').forEach(adopt);
        ask();
        order.forEach(function (name) { if (enabled(name)) wake(name, root); });
    }

    document.addEventListener('click', function (event) {
        var target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        var widget = target.closest('[data-consent]');

        if (target.closest('[data-consent-open], [data-cookie-open]')) {
            event.preventDefault();
            var first = floating && floating.isConnected ? floating : front();
            if (!first) return;
            // Floating, it stays open: the link is not an answer.
            if (first.classList.contains('is-floating') || panel(first).hidden) open(first); else close(first);
            return;
        }
        if (!widget) {
            // A click elsewhere: the floating panel, left without a word, takes the implicit answer; the others close.
            if (floating && !answered() && !floating.classList.contains('is-choosing') && visible(panel(floating))) return decide(implicitChoice());
            widgets.forEach(function (w) { if (!w.classList.contains('is-floating')) close(w); });
            return;
        }
        if (target.closest('[data-consent-accept]')) return decide(choice(function () { return true; }));
        if (target.closest('[data-consent-refuse]')) return decide(choice(function () { return false; }));
        if (target.closest('[data-consent-details]')) return choosing(widget, !widget.classList.contains('is-choosing'));
        if (target.closest('[data-consent-save]')) {
            var map = {};
            widget.querySelectorAll('[data-consent-feature]').forEach(function (input) { map[input.dataset.consentFeature] = input.checked || input.disabled; });
            return decide(map);
        }
        if (target.closest('[data-consent-toggle]')) {
            panel(widget).hidden ? open(widget) : close(widget);
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') widgets.forEach(function (w) { if (!w.classList.contains('is-floating')) close(w); });
    });

    window.Consent = {
        state: state,
        enabled: enabled,
        use: use,
        cookie: writeCookie,
        features: function () {
            return order.map(function (name) {
                var f = features[name];
                return { name: name, label: f.label, implicit: f.implicit, required: f.required, state: state(name), enabled: enabled(name) };
            });
        },
        undecided: function () { return !answered(); },
        refused: function () { return state() === false; },
        accepted: function () { return state() !== false; },
        accept: function () { decide(choice(function () { return true; })); },
        refuse: function () { decide(choice(function () { return false; })); },
        open: function () { open(); },
        scan: scan
    };

    /** Each feature already on says so to the page's scripts: on the first load and after each page swap. */
    function announce() {
        order.forEach(function (name) {
            if (enabled(name)) document.dispatchEvent(new CustomEvent(name.toLowerCase() + ':consent'));
        });
    }

    function start() {
        supersede();
        scan();
        announce();
        // transparent.js fires on window, Turbo on the document (it bubbles to window: one listener each).
        window.addEventListener('transparent:load', function () { scan(); announce(); });
        document.addEventListener('turbo:load', function () { scan(); announce(); });
        new MutationObserver(function (mutations) {
            if (mutations.some(function (m) { return m.addedNodes.length || m.removedNodes.length; })) scan();
        }).observe(document.body, { childList: true, subtree: true });
    }
    // @glitchr/cookie may come after this script (omnibase loads it async): supersede it then too.
    window.addEventListener('load', supersede);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
