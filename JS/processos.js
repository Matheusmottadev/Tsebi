(() => {
  const homeHeader = document.querySelector(".home-header");
  if (homeHeader) {
    setInterval(() => {
      homeHeader.classList.toggle("logo-cycle-image");
    }, 3000);
  }

  const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    revealItems.forEach((el) => el.classList.add("is-visible"));
  } else if (revealItems.length > 0) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        });
      },
      {
        threshold: 0.14,
        rootMargin: "0px 0px -10% 0px"
      }
    );

    revealItems.forEach((item) => observer.observe(item));
  }

  const smoothAnchors = Array.from(document.querySelectorAll('a[href^="#"]'));
  smoothAnchors.forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    });
  });
})();
