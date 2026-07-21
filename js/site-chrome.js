/**
 * site-chrome.js
 *
 * Single source of truth for the nav, mobile nav, footer, and cookie banner
 * used across every page on fincrimeradar.org.
 *
 * Each page must include two empty mount points and this script:
 *   <div id="site-nav"></div>
 *   ...page content...
 *   <div id="site-footer"></div>
 *   <script defer src="/js/site-chrome.js"></script>
 *
 * Editing the nav or footer for the whole site now means editing
 * /partials/nav.html or /partials/footer.html once, not every page.
 */

(function () {
  'use strict';

  var NAV_PARTIAL_URL = '/partials/nav.html';
  var FOOTER_PARTIAL_URL = '/partials/footer.html';
  var COOKIE_CONSENT_KEY = 'fcr_cookie_consent';

  // Minimal inline fallbacks used only if a partial fails to load,
  // so a network blip never leaves a page with no way home and no legal footer.
  var FALLBACK_NAV =
    '<nav><a class="nav-brand" href="/"><span class="nav-name">FinCrimeRadar</span></a>' +
    '<div class="nav-links"><a href="/">Back to home</a></div></nav>';

  var FALLBACK_FOOTER =
    '<footer>© 2026 FinCrimeRadar · <a href="/">Home</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a>' +
    '<div class="footer-legal">FinCrimeRadar Ltd · Registered in England and Wales · Company number 17324449 · ' +
    'Registered office: 128 City Road, London, EC1V 2NX</div></footer>';

  /**
   * Fetches a partial and injects it into the given mount element.
   * Falls back to inline markup on any network or HTTP error so the
   * page never renders with a missing nav or footer.
   */
  function loadPartial(url, mountId, fallbackHtml) {
    var mount = document.getElementById(mountId);
    if (!mount) return Promise.resolve();

    return fetch(url, { cache: 'default' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Partial fetch failed: ' + url + ' (' + response.status + ')');
        }
        return response.text();
      })
      .then(function (html) {
        mount.innerHTML = html;
      })
      .catch(function (error) {
        console.error(error);
        mount.innerHTML = fallbackHtml;
      });
  }

  function toggleMobileNav() {
    var nav = document.getElementById('mobileNav');
    var btn = document.getElementById('navHamburger');
    if (!nav || !btn) return;
    var open = nav.classList.toggle('open');
    btn.innerHTML = open ? '&#10005;' : '&#9776;';
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function closeMobileNavOnOutsideClick(event) {
    var nav = document.getElementById('mobileNav');
    var btn = document.getElementById('navHamburger');
    if (nav && nav.classList.contains('open') && !nav.contains(event.target) && event.target !== btn) {
      nav.classList.remove('open');
      if (btn) btn.innerHTML = '&#9776;';
      document.body.style.overflow = '';
    }
  }

  function acceptCookies() {
    localStorage.setItem('fcr_cookie_consent', 'accepted');
    if (typeof gtag === 'function') {
      gtag('consent', 'update', { 'analytics_storage': 'granted' });
    }
    document.getElementById('cookieBanner').style.display = 'none';
  }

  function rejectCookies() {
    localStorage.setItem('fcr_cookie_consent', 'rejected');
    if (typeof gtag === 'function') {
      gtag('consent', 'update', { 'analytics_storage': 'denied' });
    }
    document.getElementById('cookieBanner').style.display = 'none';
  }

  function initCookieBanner() {
    var banner = document.getElementById('cookieBanner');
    if (!banner) return;

    var consent = null;
    try {
      consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    } catch (error) {
      console.error('Could not read cookie consent:', error);
    }

    if (!consent) {
      banner.style.display = 'flex';
    }
  }

  /**
   * Collapses a pathname to a canonical form so "/", "/index.html", and
   * "/foo.html/" all compare equal to their counterparts. Used to match
   * nav link hrefs against the current page regardless of which of these
   * equivalent forms either side happens to be written in.
   */
  function normalizePath(path) {
    path = path.replace(/\/index\.html$/, '/');
    if (path.length > 1 && path.charAt(path.length - 1) === '/') {
      path = path.slice(0, -1);
    }
    return path || '/';
  }

  /**
   * Marks whichever injected nav link points at the current page as
   * active. Works against whatever anchors happen to exist in #site-nav,
   * desktop nav-links and mobile-nav alike, so it isn't tied to Variant
   * A's specific link set and keeps working once other nav variants are
   * added. The CTA link is deliberately skipped, it's an action button,
   * not a "you are here" indicator, on every variant seen so far.
   */
  function applyActiveNavState() {
    var mount = document.getElementById('site-nav');
    if (!mount) return;

    var currentPath = normalizePath(window.location.pathname);
    var links = mount.querySelectorAll('a[href]');

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (link.classList.contains('nav-cta')) continue;

      var linkPath;
      try {
        linkPath = normalizePath(new URL(link.getAttribute('href'), window.location.origin).pathname);
      } catch (error) {
        continue;
      }

      if (linkPath === currentPath) {
        link.classList.add('active');
      }
    }
  }

  /**
   * Optional per-page footer disclaimer. A page opts in by placing
   * <div id="page-disclaimer" data-disclaimer="..."></div> just above
   * its #site-footer mount. If that element isn't present, this is a
   * no-op and the footer renders with no disclaimer, unchanged from
   * today's behavior for every page that doesn't use the slot.
   */
  function applyPageDisclaimer() {
    var source = document.getElementById('page-disclaimer');
    if (!source) return;

    var text = source.getAttribute('data-disclaimer');
    if (!text) return;

    var footer = document.querySelector('#site-footer footer');
    if (!footer) return;

    footer.appendChild(document.createElement('br'));
    footer.appendChild(document.createElement('br'));

    var span = document.createElement('span');
    span.style.fontSize = '11px';
    span.style.color = '#9ca3af';
    span.textContent = text;
    footer.appendChild(span);
  }

  // Expose the handlers the injected markup calls via inline onclick attributes.
  // These must be global because the HTML they're wired to is injected at runtime.
  window.toggleMobileNav = toggleMobileNav;
  window.acceptCookies = acceptCookies;
  window.rejectCookies = rejectCookies;

  document.addEventListener('DOMContentLoaded', function () {
    Promise.all([
      loadPartial(NAV_PARTIAL_URL, 'site-nav', FALLBACK_NAV),
      loadPartial(FOOTER_PARTIAL_URL, 'site-footer', FALLBACK_FOOTER)
    ]).then(function () {
      initCookieBanner();
      applyActiveNavState();
      applyPageDisclaimer();
      document.addEventListener('click', closeMobileNavOnOutsideClick);
    });
  });
})();
