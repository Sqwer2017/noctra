/* Noctra website behaviour */
(function () {
  'use strict';

  const root = document.documentElement;
  const themeKey = 'noctra-site-theme';
  const accentKey = 'noctra-site-accent';
  const themeToggle = document.getElementById('theme-toggle');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const menuToggle = document.getElementById('menu-toggle');
  const siteNav = document.getElementById('site-nav');
  const header = document.getElementById('site-header');
  const scrollProgress = document.getElementById('scroll-progress');
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightbox-image');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');
  const animeLib = window.anime;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastFocus = null;

  function currentTheme() {
    return root.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function syncThemeUi() {
    const light = currentTheme() === 'light';
    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', String(light));
      themeToggle.setAttribute('aria-label', light ? 'Переключить на тёмную тему' : 'Переключить на светлую тему');
      themeToggle.title = light ? 'Тёмная тема' : 'Светлая тема';
    }
    if (metaTheme) metaTheme.setAttribute('content', light ? '#f7f2fc' : '#07060c');
  }

  function setTheme(theme, persist) {
    root.dataset.theme = theme === 'light' ? 'light' : 'dark';
    if (persist) {
      try { localStorage.setItem(themeKey, root.dataset.theme); } catch (_) {}
    }
    syncThemeUi();
  }

  syncThemeUi();

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      setTheme(currentTheme() === 'light' ? 'dark' : 'light', true);
    });
  }

  /* Accent playground */
  const accentNames = ['violet', 'ocean', 'ember', 'mint', 'rose'];
  const swatches = Array.from(document.querySelectorAll('[data-accent]'));

  function syncAccentUi() {
    const current = root.dataset.accent || 'violet';
    swatches.forEach((button) => {
      const active = button.getAttribute('data-accent') === current;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setAccent(accent, persist) {
    if (accentNames.indexOf(accent) === -1) return;
    root.dataset.accent = accent;
    if (persist) {
      try { localStorage.setItem(accentKey, accent); } catch (_) {}
    }
    syncAccentUi();
  }

  swatches.forEach((button) => {
    button.addEventListener('click', () => setAccent(button.getAttribute('data-accent'), true));
  });
  syncAccentUi();

  /* Mobile menu */
  function closeMenu() {
    if (!siteNav || !menuToggle) return;
    siteNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Открыть меню');
  }

  if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', () => {
      const open = siteNav.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    });
    siteNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  }

  document.addEventListener('click', (event) => {
    if (!siteNav || !siteNav.classList.contains('is-open')) return;
    if (event.target.closest('#site-nav') || event.target.closest('#menu-toggle')) return;
    closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      closeLightbox();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 920) closeMenu();
  }, { passive: true });

  /* Header + progress */
  function onScroll() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
    if (scrollProgress) {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollProgress.style.width = `${Math.min(100, (window.scrollY / max) * 100)}%`;
    }
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Reveal */
  const revealItems = Array.from(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -36px 0px' });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  let revealFrame = 0;
  function revealInView() {
    const height = window.innerHeight;
    revealItems.forEach((item) => {
      if (item.classList.contains('is-visible')) return;
      const rect = item.getBoundingClientRect();
      if (rect.top < height - 20 && rect.bottom > 0) item.classList.add('is-visible');
    });
  }
  function scheduleReveal() {
    if (revealFrame) return;
    revealFrame = requestAnimationFrame(() => {
      revealFrame = 0;
      revealInView();
    });
  }
  window.addEventListener('scroll', scheduleReveal, { passive: true });
  window.addEventListener('resize', scheduleReveal);
  setTimeout(revealInView, 450);

  /* Number counters */
  function animateCounter(node) {
    if (!node || node.dataset.counted === '1') return;
    node.dataset.counted = '1';
    const target = Number(node.dataset.count || 0);
    const suffix = node.dataset.suffix || '';
    if (!target) {
      node.textContent = `0${suffix}`;
      return;
    }
    if (!animeLib || typeof animeLib.animate !== 'function' || reducedMotion) {
      node.textContent = `${target}${suffix}`;
      return;
    }
    const counter = { value: 0 };
    animeLib.animate(counter, {
      value: target,
      duration: 1300,
      ease: 'outExpo',
      onUpdate: () => { node.textContent = `${Math.round(counter.value)}${suffix}`; },
      onComplete: () => { node.textContent = `${target}${suffix}`; }
    });
  }

  const counters = Array.from(document.querySelectorAll('[data-count]'));
  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    counters.forEach((node) => counterObserver.observe(node));
  } else {
    counters.forEach(animateCounter);
  }

  /* Hero app tilt */
  const heroVisual = document.querySelector('.hero-visual');
  const heroApp = document.getElementById('hero-app');
  if (heroVisual && heroApp && !reducedMotion) {
    heroVisual.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const rect = heroVisual.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      heroApp.style.setProperty('--tilt-x', (ny * 3.2).toFixed(2));
      heroApp.style.setProperty('--tilt-y', (nx * 3.6).toFixed(2));
    });
    heroVisual.addEventListener('pointerleave', () => {
      heroApp.style.setProperty('--tilt-x', '0');
      heroApp.style.setProperty('--tilt-y', '0');
    });
  }

  /* FAQ accordion */
  const faqItems = Array.from(document.querySelectorAll('[data-accordion] .faq-item'));
  faqItems.forEach((item, index) => {
    const button = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    if (!button || !answer) return;
    const answerId = `faq-answer-${index + 1}`;
    answer.id = answerId;
    answer.setAttribute('role', 'region');
    button.setAttribute('aria-controls', answerId);
    button.addEventListener('click', () => {
      const willOpen = !item.classList.contains('is-open');
      faqItems.forEach((other) => {
        if (other === item) return;
        other.classList.remove('is-open');
        const otherButton = other.querySelector('.faq-question');
        if (otherButton) otherButton.setAttribute('aria-expanded', 'false');
      });
      item.classList.toggle('is-open', willOpen);
      button.setAttribute('aria-expanded', String(willOpen));
    });
  });

  /* Lightbox */
  function openLightbox(button) {
    if (!lightbox || !lightboxImage) return;
    const src = button.getAttribute('data-lightbox');
    if (!src) return;
    lastFocus = document.activeElement;
    lightboxImage.src = src;
    lightboxImage.alt = button.getAttribute('data-caption') || '';
    if (lightboxCaption) lightboxCaption.textContent = button.getAttribute('data-caption') || '';
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    if (lightboxClose) lightboxClose.focus();
  }

  function closeLightbox() {
    if (!lightbox || !lightbox.classList.contains('is-open')) return;
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }

  document.querySelectorAll('[data-lightbox]').forEach((button) => {
    button.addEventListener('click', () => openLightbox(button));
  });
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightbox) {
    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) closeLightbox();
    });
  }

  /* Latest release */
  const versionNodes = Array.from(document.querySelectorAll('[data-release-version]'));
  const dateNodes = Array.from(document.querySelectorAll('[data-release-date]'));
  const windowsLinks = Array.from(document.querySelectorAll('.js-windows-download'));
  const windowsMeta = Array.from(document.querySelectorAll('.js-windows-meta'));

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) {
      return '';
    }
  }

  function formatSize(bytes) {
    const size = Number(bytes) || 0;
    if (!size) return '';
    return `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  }

  async function loadLatestRelease() {
    try {
      const response = await fetch('https://api.github.com/repos/Sqwer2017/noctra/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!response.ok) return;
      const release = await response.json();
      const tag = String(release.tag_name || '');
      if (tag) {
        const versionLabel = tag.startsWith('v') ? tag : `v${tag}`;
        versionNodes.forEach((node) => { node.textContent = versionLabel; });
      }
      const dateLabel = formatDate(release.published_at);
      if (dateLabel) dateNodes.forEach((node) => { node.textContent = `· ${dateLabel}`; });
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const winAsset = assets.find((asset) => /win.*x64.*\.exe$/i.test(asset.name || '') && !/blockmap/i.test(asset.name || ''));
      if (winAsset && winAsset.browser_download_url) {
        windowsLinks.forEach((link) => { link.href = winAsset.browser_download_url; });
        const sizeLabel = formatSize(winAsset.size);
        windowsMeta.forEach((node) => {
          node.textContent = ['Установщик', sizeLabel, 'x64'].filter(Boolean).join(' · ');
        });
      }
    } catch (_) {
      /* Keep static links when GitHub is unavailable. */
    }
  }

  const yearNode = document.getElementById('year');
  if (yearNode) yearNode.textContent = String(new Date().getFullYear());

  loadLatestRelease();
})();
