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

  function fixedLikeHeight(el) {
    if (!isVisible(el)) return 0;
    const style = window.getComputedStyle(el);
    const pos = style.position;
    if (pos !== 'fixed' && pos !== 'sticky') return 0;
    return el.offsetHeight || 0;
  }

  function computeStickyTop() {
    const topBar = document.querySelector('.top-bar');
    const header = document.querySelector('.home-header');
    const stickyTop = fixedLikeHeight(topBar) + fixedLikeHeight(header);
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
    } else {
      subnav.classList.remove('is-sticky-js');
      spacer.style.height = '0px';
      anchorY = null;
    }
  }

  function updateSticky() {
    if (!isVisible(subnav) || subnav.hidden) {
      setSticky(false);
      return;
    }

    const stickyTop = computeStickyTop();

    if (!isSticky || anchorY === null) {
      measureAnchor();
    }

    if (anchorY === null) {
      setSticky(false);
      return;
    }

    const hasScrolled = window.scrollY > 2;
    const shouldStick = hasScrolled && (window.scrollY + stickyTop) >= (anchorY + 1);
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
    anchorY = null;
    updateSticky();
  }

  hardRefresh();

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', hardRefresh, { passive: true });
  window.addEventListener('orientationchange', hardRefresh, { passive: true });
  window.addEventListener('hashchange', hardRefresh, { passive: true });
  window.addEventListener('account:layout-change', hardRefresh);

  window.setTimeout(hardRefresh, 0);
  window.setTimeout(hardRefresh, 250);
  window.setTimeout(hardRefresh, 800);
})();
