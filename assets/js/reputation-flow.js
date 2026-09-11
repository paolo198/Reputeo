(function () {
  'use strict';

  const section = document.querySelector('[data-trust-journey]');
  if (!section) {
    document.documentElement.classList.remove('landing-motion-ready');
    return;
  }

  const sticky = section.querySelector('.trust-journey__sticky');
  const stage = section.querySelector('[data-journey-stage]');
  const progressBar = section.querySelector('[data-journey-progress]');
  const counter = section.querySelector('[data-journey-counter]');
  const cue = section.querySelector('[data-journey-cue]');
  const lensLabel = section.querySelector('[data-lens-label]');
  const header = document.querySelector('[data-landing-nav]');
  const copies = Array.from(section.querySelectorAll('[data-journey-copy]'));
  const chapterButtons = Array.from(section.querySelectorAll('[data-journey-jump]'));
  const fragments = Array.from(section.querySelectorAll('.trust-fragment'));
  const signals = section.querySelector('[data-scene="signals"]');
  const reply = section.querySelector('[data-scene="reply"]');
  const request = section.querySelector('[data-scene="request"]');
  const resolution = section.querySelector('[data-scene="resolution"]');
  const heroImages = Array.from(section.querySelectorAll('.trust-hand'));

  if (!sticky || !stage || !('IntersectionObserver' in window)) {
    document.documentElement.classList.remove('landing-motion-ready');
    return;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compactLandscape = window.matchMedia('(max-height: 620px) and (orientation: landscape)');
  const copyWindows = [
    [0, .175],
    [.185, .395],
    [.405, .615],
    [.625, .825],
    [.835, 1.001]
  ];
  const copyFade = .034;
  const chapterStops = [0, .24, .47, .69, .91];
  const lensLabels = [
    'Un signal apparaît',
    'Les avis se réunissent',
    'L’essentiel devient clair',
    'Votre réponse reste humaine',
    'La confiance continue'
  ];

  let sectionTop = 0;
  let travel = 1;
  let currentChapter = -1;
  let frame = 0;
  let visible = true;
  let enhanced = false;
  let needsMeasure = true;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mix(start, end, amount) {
    return start + (end - start) * amount;
  }

  function smooth(start, end, value) {
    if (start === end) return value >= end ? 1 : 0;
    const amount = clamp((value - start) / (end - start), 0, 1);
    return amount * amount * (3 - 2 * amount);
  }

  function sceneOpacity(position, start, visibleAt, fadeAt, end) {
    return smooth(start, visibleAt, position) * (1 - smooth(fadeAt, end, position));
  }

  function getChapter(position) {
    if (position < .18) return 0;
    if (position < .40) return 1;
    if (position < .62) return 2;
    if (position < .83) return 3;
    return 4;
  }

  function setChapter(chapter) {
    if (chapter === currentChapter) return;
    currentChapter = chapter;
    section.dataset.chapter = String(chapter + 1);
    if (counter) counter.textContent = '0' + (chapter + 1) + ' / 05';
    if (lensLabel) lensLabel.textContent = lensLabels[chapter];
    stage.style.setProperty('--lens-radius', chapter % 2 ? '57% 43% 53% 47% / 45% 57% 43% 55%' : '48% 52% 45% 55% / 55% 43% 57% 45%');

    chapterButtons.forEach(function (button, index) {
      const active = index === chapter;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });

    copies.forEach(function (copy, index) {
      const active = index === chapter;
      copy.classList.toggle('is-active', active);
      copy.setAttribute('aria-hidden', String(!active));
      if (active) copy.removeAttribute('inert');
      else copy.setAttribute('inert', '');
    });
  }

  function setBoard(node, opacity, lift, scaleFactor) {
    if (!node) return;
    const scale = (.94 + opacity * .06) * (scaleFactor || 1);
    const y = (1 - opacity) * (lift || 28);
    node.style.opacity = opacity.toFixed(4);
    node.style.visibility = opacity > .006 ? 'visible' : 'hidden';
    node.style.transform = 'translate3d(-50%, calc(-50% + ' + y.toFixed(2) + 'px), 0) scale(' + scale.toFixed(4) + ')';
  }

  function render(position) {
    const progress = clamp(position, 0, 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const mobile = width <= 800;
    const compactPortrait = width <= 520 && height <= 720;
    const chapter = getChapter(progress);
    const approach = smooth(.015, .42, progress);
    const release = smooth(.79, .985, progress);

    setChapter(chapter);

    if (progressBar) progressBar.style.transform = 'scaleX(' + progress.toFixed(5) + ')';
    if (cue) cue.style.opacity = String(1 - smooth(.015, .09, progress));

    copies.forEach(function (copy, index) {
      const windowRange = copyWindows[index];
      const fadeIn = index === 0 ? 1 : smooth(windowRange[0], windowRange[0] + copyFade, progress);
      const fadeOut = index === copies.length - 1 ? 1 : 1 - smooth(windowRange[1] - copyFade, windowRange[1], progress);
      const opacity = fadeIn * fadeOut;
      const y = (1 - fadeIn) * 34 - (1 - fadeOut) * 24;
      const scale = .982 + opacity * .018;
      copy.style.opacity = opacity.toFixed(4);
      copy.style.visibility = opacity > .008 ? 'visible' : 'hidden';
      copy.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0) scale(' + scale.toFixed(4) + ')';
    });

    let leftX = mix(-width * (mobile ? .075 : .055), width * (mobile ? .026 : .034), approach);
    let rightX = -leftX;
    leftX = mix(leftX, -width * (mobile ? .028 : .022), release);
    rightX = mix(rightX, width * (mobile ? .028 : .022), release);
    const handY = mix(height * .055, 0, approach) + release * height * .055;
    const handScale = mix(.98, 1.075, approach) - release * .085;
    let handsOpacity = mix(.96, .52, smooth(.34, .54, progress));
    handsOpacity = mix(handsOpacity, .58, smooth(.56, .70, progress));
    handsOpacity = mix(handsOpacity, .14, smooth(.82, .985, progress));

    stage.style.setProperty('--hand-left-x', leftX.toFixed(2) + 'px');
    stage.style.setProperty('--hand-right-x', rightX.toFixed(2) + 'px');
    stage.style.setProperty('--hand-y', handY.toFixed(2) + 'px');
    stage.style.setProperty('--hand-scale', handScale.toFixed(4));
    stage.style.setProperty('--hand-left-r', mix(-1.5, .15, approach).toFixed(2) + 'deg');
    stage.style.setProperty('--hand-right-r', mix(1.5, -.15, approach).toFixed(2) + 'deg');
    stage.style.setProperty('--hands-opacity', handsOpacity.toFixed(4));

    let lensScale = mix(.64, 1.05, smooth(.01, .23, progress));
    lensScale = mix(lensScale, 1.3, smooth(.23, .47, progress));
    lensScale = mix(lensScale, .94, smooth(.48, .72, progress));
    lensScale = mix(lensScale, .68, smooth(.79, .97, progress));
    const lensOpacity = 1 - smooth(.91, .995, progress);
    stage.style.setProperty('--lens-scale', lensScale.toFixed(4));
    stage.style.setProperty('--lens-opacity', lensOpacity.toFixed(4));
    stage.style.setProperty('--lens-rotation', mix(-6, 9, progress).toFixed(2) + 'deg');

    const orbitPulse = .76 + smooth(.08, .5, progress) * .24 - smooth(.76, .98, progress) * .12;
    stage.style.setProperty('--orbit-scale', orbitPulse.toFixed(4));
    stage.style.setProperty('--orbit-inner-scale', (orbitPulse * .88).toFixed(4));
    stage.style.setProperty('--orbit-opacity', (mix(.18, .5, smooth(.08, .44, progress)) * (1 - smooth(.84, .99, progress))).toFixed(4));
    stage.style.setProperty('--orbit-rotation', (progress * 72 - 18).toFixed(2) + 'deg');

    const fragmentGather = smooth(.18, .43, progress);
    const fragmentShifts = mobile
      ? [[width * .38, height * .13], [-width * .34, height * .07], [width * .34, -height * .11]]
      : [[width * .13, height * .28], [-width * .12, height * .18], [width * .14, -height * .2]];

    fragments.forEach(function (fragment, index) {
      const delay = index * .018;
      const localReveal = smooth(.025 + delay, .105 + delay, progress);
      const opacity = localReveal * (1 - smooth(.33 + delay, .46 + delay, progress));
      const shift = fragmentShifts[index];
      const float = Math.sin(progress * 24 + index * 1.8) * 4 * (1 - fragmentGather);
      const scale = 1 - fragmentGather * .2;
      fragment.style.opacity = opacity.toFixed(4);
      fragment.style.visibility = opacity > .006 ? 'visible' : 'hidden';
      fragment.style.transform = 'translate3d(' + (shift[0] * fragmentGather).toFixed(2) + 'px,' + (shift[1] * fragmentGather + float).toFixed(2) + 'px,0) scale(' + scale.toFixed(4) + ')';
    });

    const signalOpacity = sceneOpacity(progress, .335, .405, .535, .57);
    const replyOpacity = sceneOpacity(progress, .585, .625, .745, .775);
    const requestOpacity = sceneOpacity(progress, .79, .835, .92, .955);
    const resolutionOpacity = smooth(.965, .995, progress);
    const boardScale = compactPortrait ? .82 : 1;
    setBoard(signals, signalOpacity, 30, boardScale);
    setBoard(reply, replyOpacity, 30, boardScale);
    setBoard(request, requestOpacity, 30, boardScale);

    if (resolution) {
      resolution.style.opacity = resolutionOpacity.toFixed(4);
      resolution.style.visibility = resolutionOpacity > .006 ? 'visible' : 'hidden';
      resolution.style.transform = 'translate3d(-50%, calc(-46% + ' + ((1 - resolutionOpacity) * 18).toFixed(2) + 'px), 0) scale(' + (.94 + resolutionOpacity * .06).toFixed(4) + ')';
    }

    if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
  }

  function measure() {
    const rect = section.getBoundingClientRect();
    sectionTop = rect.top + window.scrollY;
    travel = Math.max(1, section.offsetHeight - window.innerHeight);
  }

  function currentProgress() {
    return clamp((window.scrollY - sectionTop) / travel, 0, 1);
  }

  function update() {
    frame = 0;
    if (needsMeasure) {
      measure();
      needsMeasure = false;
    }
    if (!enhanced) {
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
      return;
    }
    render(currentProgress());
  }

  function requestUpdate() {
    if (frame) return;
    frame = window.requestAnimationFrame(update);
  }

  function requestMeasure() {
    needsMeasure = true;
    requestUpdate();
  }

  function clearAnimatedStyles() {
    currentChapter = -1;
    section.removeAttribute('data-chapter');
    stage.removeAttribute('style');
    copies.forEach(function (copy) {
      copy.removeAttribute('style');
      copy.removeAttribute('aria-hidden');
      copy.removeAttribute('inert');
      copy.classList.add('is-active');
    });
    fragments.forEach(function (fragment) { fragment.removeAttribute('style'); });
    [signals, reply, request, resolution].forEach(function (node) { if (node) node.removeAttribute('style'); });
  }

  function setMode() {
    const shouldEnhance = !reduceMotion.matches && !compactLandscape.matches;
    document.documentElement.classList.toggle('landing-motion-ready', shouldEnhance);
    if (shouldEnhance === enhanced) {
      requestMeasure();
      return;
    }

    enhanced = shouldEnhance;
    section.classList.toggle('is-enhanced', enhanced);
    if (!enhanced) clearAnimatedStyles();
    requestMeasure();
  }

  function jumpToChapter(index) {
    if (!enhanced) {
      copies[index].scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    measure();
    needsMeasure = false;
    window.scrollTo({ top: sectionTop + travel * chapterStops[index], behavior: 'smooth' });
  }

  chapterButtons.forEach(function (button, index) {
    button.addEventListener('click', function () { jumpToChapter(index); });
  });

  const visibilityObserver = new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    section.classList.toggle('is-visible', visible);
    if (visible) requestUpdate();
  }, { rootMargin: '20% 0px 20% 0px' });
  visibilityObserver.observe(section);

  window.addEventListener('scroll', function () {
    if (visible || window.scrollY < window.innerHeight) requestUpdate();
    else if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
  }, { passive: true });

  window.addEventListener('resize', function () {
    requestMeasure();
  }, { passive: true });
  window.addEventListener('orientationchange', function () {
    requestMeasure();
  }, { passive: true });
  window.addEventListener('pageshow', function () {
    requestMeasure();
  });

  [reduceMotion, compactLandscape].forEach(function (query) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', setMode);
    else if (typeof query.addListener === 'function') query.addListener(setMode);
  });

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(function () {
      requestMeasure();
    });
    resizeObserver.observe(section);
    resizeObserver.observe(sticky);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      requestMeasure();
    });
  }

  function waitForHeroImage(image) {
    if (image.complete) {
      if (!image.naturalWidth) return Promise.resolve(false);
      if (typeof image.decode !== 'function') return Promise.resolve(true);
      return image.decode().catch(function () {}).then(function () { return true; });
    }

    return new Promise(function (resolve) {
      image.addEventListener('load', function () { resolve(true); }, { once: true });
      image.addEventListener('error', function () { resolve(false); }, { once: true });
    });
  }

  if (heroImages.length) {
    Promise.all(heroImages.map(waitForHeroImage)).then(function (results) {
      const mediaReady = results.every(Boolean);
      section.classList.toggle('is-media-ready', mediaReady);
      section.classList.toggle('is-media-error', !mediaReady);
      requestMeasure();
    });
  } else {
    section.classList.add('is-media-error');
  }

  const revealItems = Array.from(document.querySelectorAll('[data-reveal]'));
  if (!reduceMotion.matches && revealItems.length) {
    document.documentElement.classList.add('landing-reveal-ready');
    const revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    revealItems.forEach(function (item) { revealObserver.observe(item); });
  } else {
    revealItems.forEach(function (item) { item.classList.add('is-revealed'); });
  }

  if (header) {
    const menu = document.getElementById('landingMenu');
    if (menu) {
      const observer = new MutationObserver(function () {
        header.classList.toggle('menu-open', menu.getAttribute('aria-expanded') === 'true');
      });
      observer.observe(menu, { attributes: true, attributeFilter: ['aria-expanded'] });
    }
  }

  setMode();
})();
