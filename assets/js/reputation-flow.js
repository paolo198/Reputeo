(function () {
  'use strict';

  const section = document.querySelector('[data-reputation-flow]');
  if (!section) return;

  const sticky = section.querySelector('.reputation-flow__sticky');
  const visual = section.querySelector('[data-flow-visual]');
  const progressBar = section.querySelector('[data-flow-progress]');
  const counter = section.querySelector('[data-flow-counter]');
  const cue = section.querySelector('[data-flow-cue]');
  const coreShape = section.querySelector('.reputation-flow__core-shape');
  const halo = section.querySelector('.reputation-flow__halo');
  const outerOrbit = section.querySelector('.reputation-flow__orbit--outer');
  const innerOrbit = section.querySelector('.reputation-flow__orbit--inner');
  const traces = Array.from(section.querySelectorAll('.reputation-flow__trace'));
  const copies = Array.from(section.querySelectorAll('[data-flow-copy]'));
  const coreStates = Array.from(section.querySelectorAll('[data-flow-core]'));
  const reviews = Array.from(section.querySelectorAll('[data-flow-review]'));
  const outcomes = Array.from(section.querySelectorAll('[data-flow-outcome]'));
  const drops = Array.from(section.querySelectorAll('[data-flow-drop]')).map(function (node) {
    return {
      node: node,
      circle: node.querySelector('circle'),
      startX: Number(node.dataset.startX),
      startY: Number(node.dataset.startY),
      endX: Number(node.dataset.endX),
      endY: Number(node.dataset.endY),
      radius: Number(node.dataset.radius)
    };
  });
  const gatherOffsets = [
    [-64, -43],
    [54, -56],
    [72, 18],
    [27, 72],
    [-52, 59],
    [-74, 7]
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compactLandscape = window.matchMedia('(max-height: 620px) and (orientation: landscape)');
  const touchInput = window.matchMedia('(hover: none), (pointer: coarse)');
  let currentStage = -1;
  let frame = 0;
  let isVisible = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mix(start, end, amount) {
    return start + (end - start) * amount;
  }

  function smooth(start, end, value) {
    const amount = clamp((value - start) / (end - start), 0, 1);
    return amount * amount * (3 - 2 * amount);
  }

  function setStage(stage) {
    if (stage === currentStage) return;
    currentStage = stage;
    section.dataset.stage = String(stage + 1);
    if (counter) counter.textContent = '0' + (stage + 1) + ' — 03';

    copies.forEach(function (copy, index) {
      copy.classList.toggle('is-active', index === stage);
    });
    coreStates.forEach(function (state, index) {
      state.classList.toggle('is-active', index === stage);
    });
  }

  function render(progress, forceStatic) {
    const position = clamp(progress, 0, 1);
    const merge = smooth(.04, .46, position);
    const separate = smooth(.61, .92, position);
    const coreReveal = smooth(.2, .55, position);
    const stage = position < .31 ? 0 : position < .65 ? 1 : 2;
    const responsiveScale = window.innerWidth <= 560 ? .72 : window.innerWidth <= 800 ? .82 : 1;

    setStage(forceStatic ? 2 : stage);
    visual.style.setProperty('--flow-position', position.toFixed(4));

    if (progressBar) progressBar.style.transform = 'scaleX(' + position.toFixed(4) + ')';
    if (cue) cue.style.opacity = String(1 - smooth(0, .1, position));

    drops.forEach(function (drop, index) {
      const gatheredX = mix(drop.startX, 450 + gatherOffsets[index][0], merge);
      const gatheredY = mix(drop.startY, 380 + gatherOffsets[index][1], merge);
      const x = mix(gatheredX, drop.endX, separate);
      const y = mix(gatheredY, drop.endY, separate);
      const settleScale = mix(1, index < 3 ? .7 : .56, separate);
      const mergeScale = mix(1, 1.08, merge * (1 - separate));
      drop.circle.setAttribute('cx', x.toFixed(2));
      drop.circle.setAttribute('cy', y.toFixed(2));
      drop.circle.setAttribute('r', (drop.radius * settleScale * mergeScale).toFixed(2));
      drop.node.style.opacity = String(mix(.9, index < 3 ? .78 : .48, separate));
    });

    const coreScaleX = .72 + merge * .31 + separate * .05;
    const coreScaleY = .72 + merge * .24 + separate * .08;
    coreShape.style.transform = 'scale(' + coreScaleX.toFixed(3) + ',' + coreScaleY.toFixed(3) + ') rotate(' + (position * 8 - 4).toFixed(2) + 'deg)';
    coreShape.style.opacity = String(.78 + coreReveal * .22);

    halo.style.transform = 'translate(-50%, -50%) scale(' + (.76 + merge * .42 + separate * .12).toFixed(3) + ')';
    halo.style.opacity = String(.44 + merge * .38);

    outerOrbit.style.transform = 'rotate(' + (position * 38).toFixed(2) + 'deg) scale(' + (.94 + merge * .08).toFixed(3) + ')';
    outerOrbit.style.opacity = String(.32 + merge * .62 - separate * .17);
    innerOrbit.style.transform = 'rotate(' + (-position * 54).toFixed(2) + 'deg) scale(' + (.88 + coreReveal * .18).toFixed(3) + ')';
    innerOrbit.style.opacity = String(.2 + coreReveal * .56);

    traces.forEach(function (trace, index) {
      trace.style.strokeDashoffset = String((index ? 1 : -1) * position * 170);
      trace.style.opacity = String(.12 + merge * .48 - separate * .3);
    });

    reviews.forEach(function (review, index) {
      const localFade = smooth(.05 + index * .025, .38 + index * .02, position);
      review.style.opacity = String(1 - localFade);
      review.style.transform = 'translate3d(0,' + (-10 * localFade).toFixed(2) + 'px,0) scale(' + ((1 - localFade * .08) * responsiveScale).toFixed(3) + ')';
      review.style.visibility = localFade > .99 ? 'hidden' : 'visible';
    });

    outcomes.forEach(function (outcome, index) {
      const reveal = forceStatic ? 1 : smooth(.65 + index * .035, .86 + index * .035, position);
      outcome.style.opacity = String(reveal);
      outcome.style.transform = 'translate3d(0,' + (18 * (1 - reveal)).toFixed(2) + 'px,0) scale(' + ((.94 + reveal * .06) * responsiveScale).toFixed(3) + ')';
      outcome.style.visibility = reveal < .01 ? 'hidden' : 'visible';
    });

    if (forceStatic) {
      reviews.forEach(function (review) { review.style.visibility = 'hidden'; });
      if (cue) cue.style.display = 'none';
    }
  }

  function getProgress() {
    const rect = section.getBoundingClientRect();
    const stickyTop = parseFloat(window.getComputedStyle(sticky).top) || 0;
    const travel = Math.max(1, rect.height - window.innerHeight + stickyTop);
    return clamp((stickyTop - rect.top) / travel, 0, 1);
  }

  function isStaticExperience() {
    return reduceMotion.matches || compactLandscape.matches;
  }

  function update() {
    frame = 0;
    const staticExperience = isStaticExperience();
    section.classList.toggle('is-static', staticExperience);
    section.classList.toggle('is-touch', touchInput.matches);
    render(staticExperience ? 1 : getProgress(), staticExperience);
  }

  function requestUpdate() {
    if (frame) return;
    frame = window.requestAnimationFrame(update);
  }

  const visibilityObserver = new IntersectionObserver(function (entries) {
    isVisible = entries[0].isIntersecting;
    if (isVisible) requestUpdate();
  }, { rootMargin: '25% 0px 25% 0px' });
  visibilityObserver.observe(section);

  window.addEventListener('scroll', function () {
    if (isVisible && !isStaticExperience()) requestUpdate();
  }, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  window.addEventListener('orientationchange', requestUpdate, { passive: true });

  [reduceMotion, compactLandscape, touchInput].forEach(function (query) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', requestUpdate);
    else if (typeof query.addListener === 'function') query.addListener(requestUpdate);
  });

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(requestUpdate);
    resizeObserver.observe(section);
    resizeObserver.observe(sticky);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestUpdate);
  update();
})();
