"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const HERO_VIDEO = "/videos/legacy/hero.mp4";
const HERO_IMAGE = "/images/legacy/home/hero.jpg";

export function LegacyHero() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const load = () => {
      video.src = HERO_VIDEO;
      video.load();
    };

    if ("requestIdleCallback" in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(load);
    } else {
      setTimeout(load, 300);
    }
  }, []);

  return (
    <section className="hero">
      <video
        ref={videoRef}
        className={`hero-video${isVideoReady ? " is-ready" : ""}`}
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster={HERO_IMAGE}
        onLoadedData={() => setIsVideoReady(true)}
        onCanPlay={() => setIsVideoReady(true)}
      />

      <div className="hero-text">
        <h2>Coleção Genesis</h2>
        <Link className="hero-cta-btn" href="/" prefetch={false}>
          EM BREVE
        </Link>
      </div>
    </section>
  );
}
