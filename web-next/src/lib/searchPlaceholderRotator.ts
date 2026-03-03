export const SEARCH_PLACEHOLDER_WORDS = [
  "Sonho",
  "Desejo",
  "Conceito",
  "Legado",
  "Presente",
  "Tamanho",
  "Detalhe",
] as const;

type SearchPlaceholderRotatorParams = {
  currentWordEl: HTMLElement;
  nextWordEl: HTMLElement;
  trackEl: HTMLElement;
  intervalMs?: number;
  durationMs?: number;
  words?: readonly string[];
};

export function startSearchPlaceholderRotator({
  currentWordEl,
  nextWordEl,
  trackEl,
  intervalMs = 1500,
  durationMs = 400,
  words = SEARCH_PLACEHOLDER_WORDS,
}: SearchPlaceholderRotatorParams): () => void {
  const safeWords = words.filter((word) => String(word || "").trim().length > 0);
  if (safeWords.length === 0) return () => {};

  let index = 0;
  let animating = false;
  let disposed = false;

  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = mql.matches;

  const setWords = (wordIndex: number) => {
    const current = safeWords[wordIndex % safeWords.length] || safeWords[0];
    const next = safeWords[(wordIndex + 1) % safeWords.length] || safeWords[0];
    currentWordEl.textContent = current;
    nextWordEl.textContent = next;
  };

  const resetTrackPosition = () => {
    trackEl.style.transition = "none";
    trackEl.style.transform = "translateY(0)";
    void trackEl.offsetHeight;
  };

  const onReducedMotionChange = (event: MediaQueryListEvent) => {
    reduceMotion = event.matches;
    if (reduceMotion) {
      animating = false;
      resetTrackPosition();
    }
  };

  setWords(index);
  resetTrackPosition();

  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onReducedMotionChange);
  } else {
    // @ts-ignore legacy Safari
    mql.addListener(onReducedMotionChange);
  }

  const tick = () => {
    if (disposed || animating || safeWords.length < 2) return;

    const nextIndex = (index + 1) % safeWords.length;

    if (reduceMotion) {
      index = nextIndex;
      setWords(index);
      return;
    }

    animating = true;
    trackEl.style.transition = `transform ${durationMs}ms ease-out`;
    trackEl.style.transform = "translateY(calc(-1 * var(--tsebi-placeholder-line-height)))";

    const onTransitionEnd = () => {
      if (disposed) return;
      index = nextIndex;
      setWords(index);
      resetTrackPosition();
      animating = false;
    };

    trackEl.addEventListener("transitionend", onTransitionEnd, { once: true });
  };

  const timerId = window.setInterval(tick, intervalMs);

  return () => {
    disposed = true;
    window.clearInterval(timerId);
    if (typeof mql.removeEventListener === "function") {
      mql.removeEventListener("change", onReducedMotionChange);
    } else {
      // @ts-ignore legacy Safari
      mql.removeListener(onReducedMotionChange);
    }
  };
}
