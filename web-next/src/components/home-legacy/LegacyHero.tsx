"use client";

import Link from "next/link";
import { useRef, useState } from "react";

const HERO_VIDEO = "/videos/legacy/hero.mp4";
const HERO_IMAGE = "/images/legacy/home/hero.jpg";

export function LegacyHero() {
  const [hasVideoError, setHasVideoError] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <section className="hero">
      {!hasVideoError ? (
        <video
          ref={heroVideoRef}
          className={`hero-video${isVideoReady ? " is-ready" : ""}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            const element = heroVideoRef.current;
            if (!element) return;
            if (Number.isFinite(element.duration) && element.duration > 0.2) {
              try {
                element.currentTime = 0.12;
              } catch {
                // no-op
              }
            }
          }}
          onPlaying={() => setIsVideoReady(true)}
          onError={() => {
            setHasVideoError(true);
          }}
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hero-image-fallback" src={HERO_IMAGE} alt="Coleção Genesis" loading="eager" decoding="sync" fetchPriority="high" />
      )}

      <div className="hero-text">
        <h2>Coleção Genesis</h2>
        <Link className="hero-cta-btn" href="/lancamento">
          EM BREVE
        </Link>
      </div>
    </section>
  );
}


