"use client";

import Link from "next/link";
import { useState } from "react";

const HERO_VIDEO = "/videos/legacy/hero.mp4";
const HERO_IMAGE = "/images/legacy/home/hero.jpg";

export function LegacyHero() {
  const [hasVideoError, setHasVideoError] = useState(false);
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

      {!hasVideoError ? (
        <video
          className={`hero-video${isVideoReady ? " is-ready" : ""}`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          style={{ opacity: isVideoReady ? 1 : 0 }}
          onCanPlay={() => setIsVideoReady(true)}
          onLoadedData={() => setIsVideoReady(true)}
          onError={() => {
            setIsVideoReady(false);
            setHasVideoError(true);
          }}
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
      ) : null}

      {isDev ? <div className="legacy-dev-badge">hero: {hasVideoError ? "image" : isVideoReady ? "video" : "loading"}</div> : null}

      <div className="hero-text">
        <h2>Coleção Genesis</h2>
        <Link className="hero-cta-btn" href="/lancamento">
          EM BREVE
        </Link>
      </div>
    </section>
  );
}


