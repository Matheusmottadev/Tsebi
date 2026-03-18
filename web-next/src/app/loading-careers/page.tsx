"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoadingCareersPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/carreiras");
    }, 4500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; }
        .loading-careers-root {
          position: fixed;
          inset: 0;
          background: #000;
          color: #fff;
          display: grid;
          place-items: center;
          font-family: 'Montserrat', sans-serif;
          z-index: 9999;
        }
        .loader-wrap {
          text-align: center;
          display: grid;
          gap: 20px;
          justify-items: center;
          width: min(90vw, 520px);
        }
        .loader-logo {
          font-family: 'Playfair Display', serif;
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
          letter-spacing: .4px;
        }
        .loader-logo-main {
          font-size: clamp(40px, 7vw, 68px);
          line-height: 1;
        }
        .loader-logo-sub {
          font-size: clamp(25px, 4vw, 42px);
          line-height: 1;
        }
        .loader-reveal-mask {
          display: inline-block;
          white-space: nowrap;
          overflow: hidden;
          clip-path: inset(0 100% 0 0);
          animation: revealMask 1.35s ease-out .2s forwards;
        }
        .loader-line {
          width: 100%;
          height: 2px;
          background: rgba(255,255,255,.2);
          position: relative;
          overflow: hidden;
        }
        .loader-line::before {
          content: "";
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          background: #fff;
          transform-origin: left center;
          transform: scaleX(0);
          animation:
            fillLine 1.35s ease-out .2s forwards,
            pulseLine 1.15s ease-in-out 1.55s infinite;
        }
        @keyframes revealMask {
          from { clip-path: inset(0 100% 0 0); }
          to   { clip-path: inset(0 0 0 0); }
        }
        @keyframes fillLine {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes pulseLine {
          0%, 100% { opacity: 1; }
          50%       { opacity: .45; }
        }
      `}</style>

      <div className="loading-careers-root">
        <main className="loader-wrap" aria-label="Carregando página de carreiras">
          <h1 className="loader-logo loader-reveal-mask">
            <span className="loader-logo-main">Tsebi</span>
            <span className="loader-logo-sub">Careers</span>
          </h1>
          <div className="loader-line" aria-hidden="true" />
        </main>
      </div>
    </>
  );
}
