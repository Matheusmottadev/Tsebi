"use client";

import Link from "next/link";
import { useState } from "react";

const HERO_VIDEO = "/videos/legacy/hero.mp4";
const HERO_IMAGE = "/images/legacy/home/hero.jpg";

type HeroMediaMode = "video" | "image" | "fallback";

export function LegacyHero() {
  const [mediaMode, setMediaMode] = useState<HeroMediaMode>("video");
  const [isVideoReady, setIsVideoReady] = useState(false);
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <section className="hero">
      {/* Keep the final hero image mounted as the base to avoid placeholder flashes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="hero-image-base"
        src={HERO_IMAGE}
        alt="Coleção Genesis"
        loading="eager"
        decoding="sync"
        fetchPriority="high"
      />

      {mediaMode === "video" ? (
        <video
          className={`hero-video${isVideoReady ? " is-ready" : ""}`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={HERO_IMAGE}
          onLoadedData={() => setIsVideoReady(true)}
          onError={() => {
            setIsVideoReady(false);
            setMediaMode("image");
          }}
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="hero-video"
          src={HERO_IMAGE}
          alt="Coleção Genesis"
          onError={(event) => {
            const element = event.currentTarget;
            element.onerror = null;
            setMediaMode("fallback");
            element.style.display = "none";
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


