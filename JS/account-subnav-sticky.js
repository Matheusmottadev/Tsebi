(function initSmartAccountSubnavSticky() {
  const subnav = document.querySelector('.conta-subnav, .account-subnav');
  if (!subnav) return;

  const root = document.documentElement;
  const parent = subnav.parentNode;
  if (!parent) return;

  let spacer = parent.querySelector(':scope > .subnav-sticky-spacer');
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.className = 'subnav-sticky-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    parent.insertBefore(spacer, subnav.nextSibling);
  }

  let isSticky = false;
  let anchorY = null;
  let rafId = 0;

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function getFixedLikeHeight(el) {
    if (!isVisible(el)) return 0;
    const style = window.getComputedStyle(el);
    const pos = style.position;
    if (pos !== 'fixed' && pos !== 'sticky') return 0;
    return el.offsetHeight || 0;
  }

  function computeStickyTop() {
    const topBar = document.querySelector('.top-bar');
    const header = document.querySelector('.home-header');
    const stickyTop = getFixedLikeHeight(topBar) + getFixedLikeHeight(header);
    root.style.setProperty('--sticky-top', `${stickyTop}px`);
    return stickyTop;
  }

  function measureAnchor() {
    if (!isVisible(subnav) || subnav.hidden) {
      anchorY = null;
      return;
    }
    const rect = subnav.getBoundingClientRect();
    anchorY = window.scrollY + rect.top;
  }

  function setSticky(on) {
    if (on === isSticky) return;
    isSticky = on;

    if (on) {
      subnav.classList.add('is-sticky-js');
      spacer.style.height = `${subnav.offsetHeight}px`;
      return;
    }

    subnav.classList.remove('is-sticky-js');
    spacer.style.height = '0px';
  }

  function updateSticky() {
    if (!isVisible(subnav) || subnav.hidden) {
      setSticky(false);
      return;
    }

    const stickyTop = computeStickyTop();

    if (anchorY === null || !isSticky) {
      measureAnchor();
    }

    if (anchorY === null) {
      setSticky(false);
      return;
    }

    const shouldStick = window.scrollY >= (anchorY - stickyTop);
    setSticky(shouldStick);
  }

  function requestUpdate() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      updateSticky();
    });
  }

  function hardRefresh() {
    computeStickyTop();
    measureAnchor();
    updateSticky();
  }

  hardRefresh();

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', () => {
    anchorY = null;
    hardRefresh();
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    anchorY = null;
    hardRefresh();
  }, { passive: true });

  const mutationObserver = new MutationObserver(() => {
    anchorY = null;
    hardRefresh();
  });

  mutationObserver.observe(subnav, {
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class']
  });

  const dashboard = document.getElementById('contaDashboard');
  if (dashboard) {
    mutationObserver.observe(dashboard, {
      attributes: true,
      attributeFilter: ['hidden', 'style', 'class']
    });
  }
})();
