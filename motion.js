/* Gold Obsidian: progressive enhancement, native scrolling, no dependencies. */
(() => {
  'use strict';
  if (document.querySelector('.motion-progress')) return;
  const root = document.documentElement;
  const media = query => typeof window.matchMedia === 'function'
    ? window.matchMedia(query) : { matches: false };
  const reduced = media('(prefers-reduced-motion: reduce)');
  const fine = media('(pointer: fine)');
  const targets = 'main section, .section-heading, .channel-hero, .track-card, .artist-card, .resource-card, .mini-tool';
  const cards = '.track-card, .artist-card, .resource-card, .mini-tool';
  const seen = new WeakSet();
  const bar = document.createElement('div');
  bar.className = 'motion-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let observer;
  let frame = null;
  let glow = null;
  let point = null;
  const raf = window.requestAnimationFrame || (fn => window.setTimeout(fn, 16));

  function clearGlow() {
    if (glow) {
      glow.classList.remove('motion-glow');
      glow.style.removeProperty('--motion-x');
      glow.style.removeProperty('--motion-y');
    }
    glow = point = null;
  }

  function paint() {
    frame = null;
    if (reduced.matches) return;
    const height = Math.max(root.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    const progress = height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0;
    bar.style.transform = `scaleX(${progress})`;
    if (glow && point && glow.isConnected && fine.matches) {
      const rect = glow.getBoundingClientRect();
      glow.style.setProperty('--motion-x', `${point.x - rect.left}px`);
      glow.style.setProperty('--motion-y', `${point.y - rect.top}px`);
      glow.classList.add('motion-glow');
    }
  }

  function schedule() {
    if (!reduced.matches && frame === null) frame = raf(paint);
  }

  function discover(container) {
    if (!observer || reduced.matches) return;
    const list = [...(container.matches?.(targets) ? [container] : []), ...container.querySelectorAll(targets)];
    list.forEach(el => {
      if (seen.has(el)) return;
      seen.add(el);
      const siblings = el.parentElement ? [...el.parentElement.children].filter(item => item.matches(targets)) : [];
      el.style.setProperty('--motion-delay', `${Math.min(Math.max(0, siblings.indexOf(el)), 4) * 70}ms`);
      // Observe before hiding: a failed observer must leave readable content.
      observer.observe(el);
      el.classList.add('motion-pending');
    });
  }

  function configure() {
    observer?.disconnect();
    observer = null;
    root.classList.toggle('motion-reduced', reduced.matches);
    clearGlow();
    document.querySelectorAll('.motion-pending').forEach(el => el.classList.remove('motion-pending'));
    if (!reduced.matches && typeof window.IntersectionObserver === 'function') {
      observer = new window.IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.remove('motion-pending');
          observer?.unobserve(entry.target);
        });
      }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
      discover(document);
    }
    schedule();
  }

  document.addEventListener('pointermove', event => {
    if (reduced.matches || !fine.matches) return;
    const card = event.target.closest?.(cards);
    if (card !== glow) { clearGlow(); glow = card; }
    if (glow) { point = { x: event.clientX, y: event.clientY }; schedule(); }
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (glow && (!event.relatedTarget || !glow.contains(event.relatedTarget))) clearGlow();
  });
  document.addEventListener('focusin', event => {
    // Keyboard navigation must never land on an invisible control.
    for (let el = event.target; el; el = el.parentElement) {
      el.classList.remove('motion-pending');
      observer?.unobserve(el);
    }
  });
  window.addEventListener('blur', clearGlow);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule);
  document.addEventListener('load', schedule, true);
  const listen = (query, fn) => {
    if (query.addEventListener) query.addEventListener('change', fn);
    else if (query.addListener) query.addListener(fn);
  };
  listen(reduced, configure);
  listen(fine, () => { if (!fine.matches) clearGlow(); });
  configure();
  const main = document.querySelector('main');
  if (main && typeof window.MutationObserver === 'function') {
    new window.MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(el => {
        if (el.nodeType === 1) discover(el);
      }));
      schedule();
    }).observe(main, { childList: true, subtree: true });
  }
  if (typeof window.ResizeObserver === 'function') {
    new window.ResizeObserver(schedule).observe(document.body);
  }
})();
