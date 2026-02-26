(function initAccountSectionLoader() {
  const sectionLoader = document.getElementById("sectionLoader");
  const sectionMount = document.getElementById("accountSectionMount");
  const sectionLinks = document.querySelectorAll(
    ".conta-subnav [data-section], .account-subnav [data-section]"
  );

  function showSectionLoader() {
    if (!sectionLoader) return;
    sectionLoader.classList.add("is-active");
    sectionLoader.setAttribute("aria-hidden", "false");
  }

  function hideSectionLoader() {
    if (!sectionLoader) return;
    sectionLoader.classList.remove("is-active");
    sectionLoader.setAttribute("aria-hidden", "true");
  }

  function setActiveLink(clickedLink) {
    const nav = clickedLink && clickedLink.closest(".conta-subnav, .account-subnav");
    if (!nav) return;
    nav.querySelectorAll("a.is-active").forEach((link) => link.classList.remove("is-active"));
    clickedLink.classList.add("is-active");
  }

  async function navigateAccountSection(link) {
    if (!link) return;
    const target = String(link.getAttribute("data-target") || link.getAttribute("href") || "").trim();

    showSectionLoader();
    await new Promise((resolve) => window.setTimeout(resolve, 150));

    if (target.startsWith("#")) {
      setActiveLink(link);
      if (sectionMount) {
        const destination = document.querySelector(target);
        if (destination) {
          destination.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      hideSectionLoader();
      return;
    }

    if (target) {
      window.location.href = target;
      return;
    }

    hideSectionLoader();
  }

  sectionLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigateAccountSection(link);
    });
  });

  window.showSectionLoader = showSectionLoader;
  window.hideSectionLoader = hideSectionLoader;
  window.navigateAccountSection = navigateAccountSection;
})();
