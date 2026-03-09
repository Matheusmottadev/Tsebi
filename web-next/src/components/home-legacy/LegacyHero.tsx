"use client";

import Link from "next/link";
import { useState } from "react";

const HERO_VIDEO = "/videos/legacy/hero.mp4";
const HERO_IMAGE = "/images/legacy/home/hero.jpg";

export function LegacyHero() {
  const [isVideoReady, setIsVideoReady] = useState(false);

  return (
    <section className="hero">
      <video
        className={`hero-video${isVideoReady ? " is-ready" : ""}`}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={HERO_IMAGE}
        onLoadedData={() => setIsVideoReady(true)}
        onCanPlay={() => setIsVideoReady(true)}
      >
        <source src={HERO_VIDEO} type="video/mp4" />
      </video>

      <div className="hero-text">
        <h2>Coleção Genesis</h2>
        <Link className="hero-cta-btn" href="/">
          EM BREVE
        </Link>
      </div>
    </section>
  );
}
