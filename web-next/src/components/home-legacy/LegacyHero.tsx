"use client";

import Link from "next/link";
import { useState } from "react";

const HERO_VIDEO = "/videos/legacy/hero.mp4";
const HERO_IMAGE = "/images/legacy/home/hero.jpg";

export function LegacyHero() {
  const [hasVideoError, setHasVideoError] = useState(false);

  return (
    <section className="hero">
      {!hasVideoError ? (
        <video
          className="hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
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


