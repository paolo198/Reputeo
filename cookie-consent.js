(function () {
  'use strict';

  var STORAGE_KEY = 'reputeo_google_consent';
  var TAG_ID = 'AW-18389262632';
  var GA4_TAG_ID = 'G-DGH5J2HRJB';
  var tagLoaded = false;

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

  function addStyles() {
    if (document.getElementById('reputeo-cookie-styles')) {
      return;
    }

    var style = document.createElement('style');
    style.id = 'reputeo-cookie-styles';
    style.textContent = [
      '#reputeo-cookie-banner{position:fixed;z-index:2147483647;left:24px;bottom:24px;width:min(520px,calc(100vw - 48px));box-sizing:border-box;padding:28px 30px 26px;border:1px solid rgba(20,34,57,.17);border-radius:24px;background:linear-gradient(145deg,rgba(255,255,255,.99),rgba(246,250,250,.98));box-shadow:0 24px 64px rgba(15,29,50,.22);font-family:inherit;color:#142239}',
      '#reputeo-cookie-banner.is-hidden{display:none}',
      '#reputeo-cookie-banner h2{margin:0 0 10px;font-size:23px;line-height:1.12;letter-spacing:-.04em}',
      '#reputeo-cookie-banner p{max-width:440px;margin:0;color:#5f6f87;font-size:15px;line-height:1.55}',
      '#reputeo-cookie-actions{display:flex;align-items:center;gap:12px;margin-top:24px}',
      '#reputeo-cookie-actions button{min-height:44px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,background .18s ease}',
      '#reputeo-cookie-actions button:hover{transform:translateY(-1px)}',
      '#reputeo-cookie-accept{border:1px solid #0f6f69;border-radius:999px;padding:11px 20px;background:#0e8279;color:#fff;box-shadow:0 9px 20px rgba(14,130,121,.22)}',
      '#reputeo-cookie-reject{border:1px solid #cbd5df;border-radius:999px;padding:11px 18px;background:rgba(255,255,255,.72);color:#142239}',
      '@media(max-width:640px){#reputeo-cookie-banner{left:14px;bottom:14px;width:calc(100vw - 28px);padding:24px 22px;border-radius:20px}#reputeo-cookie-banner h2{font-size:21px}#reputeo-cookie-actions{flex-direction:column-reverse;align-items:stretch}#reputeo-cookie-actions button{width:100%}}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildConsentUi() {
    addStyles();

    var banner = document.createElement('aside');
    banner.id = 'reputeo-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Préférences de confidentialité');
    banner.innerHTML = '<h2>Votre vie privée compte.</h2><p>Reputeo utilise des cookies de mesure uniquement avec votre accord, pour comprendre les inscriptions et améliorer nos campagnes.</p><div id="reputeo-cookie-actions"><button id="reputeo-cookie-reject" type="button">Refuser</button><button id="reputeo-cookie-accept" type="button">Accepter les cookies</button></div>';

    document.body.appendChild(banner);

    function hideBanner() {
      banner.classList.add('is-hidden');
    }

    function choose(choice) {
      setChoice(choice);
      if (choice === 'granted') {
        enableGoogleTag();
      } else {
        updateConsent(false);
      }
      hideBanner();
    }

    document.getElementById('reputeo-cookie-accept').addEventListener('click', function () {
      choose('granted');
    });
    document.getElementById('reputeo-cookie-reject').addEventListener('click', function () {
      choose('denied');
    });
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
