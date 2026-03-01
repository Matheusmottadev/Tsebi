"use client";

import Link from "next/link";
import { useState } from "react";

const HERO_VIDEO = "/videos/legacy/hero.mp4";
const HERO_IMAGE = "/images/legacy/home/hero.jpg";
const HERO_PLACEHOLDER = "/images/placeholderreal.webp";

type HeroMediaMode = "video" | "image" | "fallback";

export function LegacyHero() {
  const [mediaMode, setMediaMode] = useState<HeroMediaMode>("video");
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <section className="hero">
      {mediaMode === "video" ? (
        <video
          className="hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={HERO_IMAGE}
          onError={() => setMediaMode("image")}
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="hero-video"
          src={mediaMode === "image" ? HERO_IMAGE : HERO_PLACEHOLDER}
          alt="Coleção Genesis"
          onError={(event) => {
            const element = event.currentTarget;
            element.onerror = null;
            setMediaMode("fallback");
            element.src = HERO_PLACEHOLDER;
          }}
        />
      )}

      {isDev ? <div className="legacy-dev-badge">hero: {mediaMode}</div> : null}

      <div className="hero-text">
        <h2>Coleção Genesis</h2>
        <Link className="hero-cta-btn" href="/lancamento">
          EM BREVE
        </Link>
      </div>
    </section>
  );
}


