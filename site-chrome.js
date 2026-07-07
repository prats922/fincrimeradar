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
  var GA_MEASUREMENT_ID = 'G-FC1VMTE7JH';
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

    return fetch(url, { cache: 'force-cache' })
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

  function disableGoogleAnalytics() {
    window['ga-disable-' + GA_MEASUREMENT_ID] = true;
  }

  function acceptCookies() {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    } catch (error) {
      // localStorage can throw in private browsing modes on some browsers.
      console.error('Could not persist cookie consent:', error);
    }
    var banner = document.getElementById('cookieBanner');
    if (banner) banner.style.display = 'none';
  }

  function rejectCookies() {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, 'rejected');
    } catch (error) {
      console.error('Could not persist cookie consent:', error);
    }
    disableGoogleAnalytics();
    var banner = document.getElementById('cookieBanner');
    if (banner) banner.style.display = 'none';
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
    } else if (consent === 'rejected') {
      disableGoogleAnalytics();
    }
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
      document.addEventListener('click', closeMobileNavOnOutsideClick);
    });
  });
})();
