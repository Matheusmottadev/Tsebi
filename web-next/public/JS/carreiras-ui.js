(() => {
  const backBtn = document.getElementById("careersBackHome");
  if (!backBtn) return;

  const SHOW_AFTER = 220;

  function syncVisibility() {
    const y = window.scrollY || window.pageYOffset || 0;
    backBtn.classList.toggle("is-visible", y > SHOW_AFTER);
  }

  window.addEventListener("scroll", syncVisibility, { passive: true });
  syncVisibility();
})();
