(function fixAccountHeaderStack() {
  const body = document.body;
  if (!body) return;

  const isConta = body.classList.contains('conta-page');
  const isProfile = body.classList.contains('account-profile-page');
  if (!isConta && !isProfile) return;

  const topBar = document.querySelector('.top-bar');
  const header = document.querySelector('.home-header');
  if (!header) return;

  function setVars() {
    const topBarH = topBar ? Math.round(topBar.getBoundingClientRect().height) : 0;
    const headerH = Math.round(header.getBoundingClientRect().height);

    if (isConta) {
      body.style.setProperty('--conta-topbar-height', `${topBarH}px`);
      body.style.setProperty('--conta-header-height', `${headerH}px`);
      body.style.setProperty('--conta-fixed-stack', `${topBarH + headerH}px`);
    }

    if (isProfile) {
      body.style.setProperty('--account-topbar-h', `${topBarH}px`);
      body.style.setProperty('--account-header-h', `${headerH}px`);
      body.style.setProperty('--account-fixed-stack', `${topBarH + headerH}px`);
    }
  }

  setVars();
  window.addEventListener('resize', setVars, { passive: true });
  window.addEventListener('orientationchange', setVars, { passive: true });
  window.addEventListener('load', setVars, { passive: true });

  setTimeout(setVars, 150);
  setTimeout(setVars, 600);
})();
