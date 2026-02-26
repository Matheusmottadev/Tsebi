export type SmoothScrollState = {
  targetScroll: number;
  currentScroll: number;
  reducedMotion: boolean;
};

export type SmoothScrollSubscriber = (state: SmoothScrollState) => void;

export type SmoothScrollOptions = {
  easing?: number;
};

function clampEasing(value: number): number {
  if (!Number.isFinite(value)) return 0.08;
  return Math.max(0.01, Math.min(0.35, value));
}

class SmoothScrollEngine {
  private targetScroll = 0;
  private currentScroll = 0;
  private easing = 0.08;
  private rafId = 0;
  private initialized = false;
  private reducedMotion = false;
  private subscribers = new Set<SmoothScrollSubscriber>();
  private mediaQuery: MediaQueryList | null = null;
  private disposeMotionListener: (() => void) | null = null;

  configure(options: SmoothScrollOptions = {}): void {
    if (typeof options.easing === "number") {
      this.easing = clampEasing(options.easing);
    }
  }

  subscribe(subscriber: SmoothScrollSubscriber): () => void {
    this.ensureInitialized();
    this.subscribers.add(subscriber);
    subscriber(this.getState());

    return () => {
      this.subscribers.delete(subscriber);
      if (this.subscribers.size === 0) {
        this.stopLoop();
      }
    };
  }

  private ensureInitialized(): void {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;

    this.targetScroll = window.scrollY || 0;
    this.currentScroll = this.targetScroll;

    this.mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = this.mediaQuery.matches;
    const onMotionChange = () => {
      this.reducedMotion = this.mediaQuery?.matches || false;
      if (this.reducedMotion) {
        this.currentScroll = this.targetScroll;
      }
      this.notify();
    };

    if (typeof this.mediaQuery.addEventListener === "function") {
      this.mediaQuery.addEventListener("change", onMotionChange);
      this.disposeMotionListener = () => this.mediaQuery?.removeEventListener("change", onMotionChange);
    } else {
      this.mediaQuery.addListener(onMotionChange);
      this.disposeMotionListener = () => this.mediaQuery?.removeListener(onMotionChange);
    }

    window.addEventListener("scroll", this.onScroll, { passive: true });
  }

  private onScroll = (): void => {
    if (typeof window === "undefined") return;
    this.targetScroll = window.scrollY || 0;

    if (this.reducedMotion) {
      this.currentScroll = this.targetScroll;
      this.notify();
      return;
    }

    if (!this.rafId) {
      this.rafId = window.requestAnimationFrame(this.step);
    }
  };

  private step = (): void => {
    this.rafId = 0;
    const delta = this.targetScroll - this.currentScroll;
    if (Math.abs(delta) < 0.1) {
      this.currentScroll = this.targetScroll;
      this.notify();
      return;
    }

    this.currentScroll += delta * this.easing;
    this.notify();
    this.rafId = window.requestAnimationFrame(this.step);
  };

  private stopLoop(): void {
    if (typeof window === "undefined") return;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private notify(): void {
    const state = this.getState();
    this.subscribers.forEach((subscriber) => subscriber(state));
  }

  private getState(): SmoothScrollState {
    return {
      targetScroll: this.targetScroll,
      currentScroll: this.currentScroll,
      reducedMotion: this.reducedMotion,
    };
  }
}

let singleton: SmoothScrollEngine | null = null;

export function getSmoothScrollEngine(options: SmoothScrollOptions = {}): SmoothScrollEngine {
  if (!singleton) singleton = new SmoothScrollEngine();
  singleton.configure(options);
  return singleton;
}

