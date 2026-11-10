/* Noctra website behaviour */
(function () {
  'use strict';

  const root = document.documentElement;
  const storageKey = 'noctra-site-theme';
  const themeToggle = document.getElementById('theme-toggle');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const menuToggle = document.getElementById('menu-toggle');
  const siteNav = document.getElementById('site-nav');
  const header = document.getElementById('site-header');
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightbox-image');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');
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
    if (metaTheme) metaTheme.setAttribute('content', light ? '#f8f5fd' : '#07060c');
  }

  function setTheme(theme, persist) {
    root.dataset.theme = theme === 'light' ? 'light' : 'dark';
    if (persist) {
      try { localStorage.setItem(storageKey, root.dataset.theme); } catch (_) {}
    }
    syncThemeUi();
  }

  syncThemeUi();

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      setTheme(currentTheme() === 'light' ? 'dark' : 'light', true);
    });
  }

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
    siteNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });
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

  const onScroll = () => {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Scroll reveal */
  const revealItems = Array.from(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

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

  /* Latest GitHub release */
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
      if (dateLabel) {
        dateNodes.forEach((node) => { node.textContent = `· ${dateLabel}`; });
      }
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
      /* Offline or GitHub unavailable: keep the static release links. */
    }
  }

  loadLatestRelease();
})();
