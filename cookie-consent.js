(function () {
  'use strict';

  var STORAGE_KEY = 'reputeo_google_consent';
  var TAG_ID = 'AW-18389262632';
  var GA4_TAG_ID = 'G-DGH5J2HRJB';
  var SIGN_UP_CONVERSION = 'AW-18389262632/TR-SCJi7yOEcEKjC18BE';
  var tagLoaded = false;
  var trackedConversions = {};

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500
  });

  function getChoice() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function setChoice(choice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch (error) {
      // Le site reste utilisable si le navigateur bloque le stockage local.
    }
  }

  function updateConsent(granted) {
    var value = granted ? 'granted' : 'denied';
    window.gtag('consent', 'update', {
      ad_storage: value,
      analytics_storage: value,
      ad_user_data: value,
      ad_personalization: value
    });
  }

  function enableGoogleTag() {
    updateConsent(true);

    if (tagLoaded || document.querySelector('script[data-reputeo-google-tag]')) {
      return;
    }

    tagLoaded = true;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + TAG_ID;
    script.setAttribute('data-reputeo-google-tag', 'true');
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', TAG_ID);
    window.gtag('config', GA4_TAG_ID);
  }

  // À utiliser uniquement avec des données non personnelles.
  window.reputeoTrack = function (eventName, parameters) {
    if (getChoice() !== 'granted') {
      return false;
    }

    enableGoogleTag();
    window.gtag('event', eventName, parameters || {});
    return true;
  };

  // Conversion Google Ads : seulement après la création effective d'un compte,
  // jamais à la simple visite de la page. L'identifiant Supabase évite les doublons.
  window.reputeoTrackSignUpConversion = function (userId) {
    if (!userId || getChoice() !== 'granted') {
      return false;
    }

    var storageKey = 'reputeo_google_ads_signup_' + userId;
    try {
      if (window.sessionStorage.getItem(storageKey) || trackedConversions[storageKey]) {
        return false;
      }
      window.sessionStorage.setItem(storageKey, '1');
    } catch (error) {
      if (trackedConversions[storageKey]) {
        return false;
      }
    }

    trackedConversions[storageKey] = true;
    enableGoogleTag();
    window.gtag('event', 'conversion', { send_to: SIGN_UP_CONVERSION });
    return true;
  };

  function addStyles() {
    if (document.getElementById('reputeo-cookie-styles')) {
      return;
    }

    var style = document.createElement('style');
    style.id = 'reputeo-cookie-styles';
    style.textContent = [
      '#reputeo-cookie-banner{position:fixed;z-index:2147483647;left:24px;bottom:24px;width:min(500px,calc(100vw - 48px));box-sizing:border-box;padding:24px;border:1px solid #cfdad7;border-radius:16px;background:#fff;box-shadow:0 24px 64px rgba(21,35,31,.2);font-family:inherit;color:#172033;animation:reputeoCookieIn .24s cubic-bezier(.2,.8,.2,1) both}',
      '#reputeo-cookie-banner.is-hidden{display:none}',
      '#reputeo-cookie-banner h2{margin:0 0 9px;font:700 20px/1.18 Manrope,DM Sans,sans-serif;letter-spacing:-.045em}',
      '#reputeo-cookie-banner p{max-width:450px;margin:0;color:#667085;font-size:14px;line-height:1.6}',
      '#reputeo-cookie-banner p a{color:#0b5f58;font-weight:700;text-underline-offset:3px}',
      '#reputeo-cookie-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;margin-top:21px}',
      '#reputeo-cookie-actions button{min-height:42px;padding:9px 15px;border-radius:9px;font:700 13px DM Sans,sans-serif;cursor:pointer;transition:transform .1s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease}',
      '#reputeo-cookie-actions button:focus-visible{outline:3px solid rgba(25,138,128,.28);outline-offset:2px}',
      '#reputeo-cookie-actions button:active{transform:scale(.985)}',
      '#reputeo-cookie-accept{border:1px solid #0b5f58;background:#0b5f58;color:#fff;box-shadow:0 7px 16px rgba(11,95,88,.15)}',
      '#reputeo-cookie-accept:hover{background:#084b47}',
      '#reputeo-cookie-reject{border:1px solid #c8d4d1;background:#fff;color:#25364b}',
      '#reputeo-cookie-reject:hover{border-color:#9fb7b1;background:#f7faf9;color:#0b5f58}',
      '@keyframes reputeoCookieIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}',
      '@media(max-width:640px){#reputeo-cookie-banner{left:12px;bottom:12px;width:calc(100vw - 24px);padding:21px 18px calc(18px + env(safe-area-inset-bottom));border-radius:14px}#reputeo-cookie-banner h2{font-size:19px}#reputeo-cookie-actions{display:grid;grid-template-columns:1fr 1fr}#reputeo-cookie-actions button{width:100%}}',
      '@media(prefers-reduced-motion:reduce){#reputeo-cookie-banner{animation:none}}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildConsentUi() {
    addStyles();

    var banner = document.createElement('aside');
    banner.id = 'reputeo-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-labelledby', 'reputeo-cookie-title');
    banner.setAttribute('aria-describedby', 'reputeo-cookie-description');
    banner.innerHTML = '<h2 id="reputeo-cookie-title">Vos préférences, simplement.</h2><p id="reputeo-cookie-description">Les cookies essentiels maintiennent Reputeo opérationnel. Avec votre accord, Google Analytics et Google Ads nous aident à mesurer les inscriptions. <a href="/privacy">En savoir plus</a>.</p><div id="reputeo-cookie-actions"><button id="reputeo-cookie-reject" type="button">Refuser la mesure</button><button id="reputeo-cookie-accept" type="button">Accepter la mesure</button></div>';

    document.body.appendChild(banner);

    function hideBanner() {
      banner.classList.add('is-hidden');
    }

    function showBanner() {
      banner.classList.remove('is-hidden');
      window.setTimeout(function () {
        var currentChoice = getChoice();
        var focusTarget = document.getElementById(currentChoice === 'granted' ? 'reputeo-cookie-accept' : 'reputeo-cookie-reject');
        if (focusTarget) focusTarget.focus();
      }, 0);
    }

    function choose(choice) {
      setChoice(choice);
      if (choice === 'granted') {
        enableGoogleTag();
      } else {
        updateConsent(false);
      }
      hideBanner();
      window.dispatchEvent(new CustomEvent('reputeo:consent', { detail: { choice: choice } }));
    }

    document.getElementById('reputeo-cookie-accept').addEventListener('click', function () {
      choose('granted');
    });
    document.getElementById('reputeo-cookie-reject').addEventListener('click', function () {
      choose('denied');
    });
    window.reputeoOpenCookiePreferences = showBanner;
    var choice = getChoice();
    if (choice === 'granted') {
      enableGoogleTag();
      hideBanner();
    } else if (choice === 'denied') {
      updateConsent(false);
      hideBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildConsentUi);
  } else {
    buildConsentUi();
  }
})();
