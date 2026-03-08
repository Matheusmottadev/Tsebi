"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type ProductImageProps = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  imageBaseUrl?: string;
  priority?: boolean;
};

const FALLBACK_IMAGE_SRC = "/images/placeholderreal.webp";

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function resolveImageSource(src: string, imageBaseUrl?: string): { resolvedSrc: string; useNextImage: boolean } {
  const raw = String(src || "").trim();
  if (!raw) return { resolvedSrc: "", useNextImage: false };

  if (raw.startsWith("data:")) {
    return { resolvedSrc: raw, useNextImage: false };
  }

  if (isAbsoluteHttpUrl(raw)) {
    return { resolvedSrc: raw, useNextImage: false };
  }

  if (raw.startsWith("/")) {
    return { resolvedSrc: raw, useNextImage: true };
  }

  const normalized = raw.replace(/^\.?\//, "");
  if (imageBaseUrl && isAbsoluteHttpUrl(imageBaseUrl)) {
    try {
      return {
        resolvedSrc: new URL(`/${normalized}`, `${imageBaseUrl}/`).toString(),
        useNextImage: false,
      };
    } catch {
      return { resolvedSrc: `/${normalized}`, useNextImage: true };
    }
  }

  return { resolvedSrc: `/${normalized}`, useNextImage: true };
}

export function ProductImage({
  src,
  alt,
  width = 720,
  height = 900,
  className,
  imageBaseUrl,
  priority = false,
}: ProductImageProps) {
  const { resolvedSrc } = useMemo(() => resolveImageSource(src, imageBaseUrl), [src, imageBaseUrl]);
  const [currentSrc, setCurrentSrc] = useState(resolvedSrc || FALLBACK_IMAGE_SRC);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(resolvedSrc || FALLBACK_IMAGE_SRC);
    setHasFailed(false);
  }, [resolvedSrc]);

  const { resolvedSrc: safeSrc, useNextImage } = resolveImageSource(currentSrc, imageBaseUrl);

  if (!safeSrc) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          aspectRatio: `${width} / ${height}`,
          background: "#f2f2f2",
        }}
        aria-hidden="true"
      />
    );
  }

  if (useNextImage) {
    return (
      <Image
        src={safeSrc}
        alt={alt}
        width={width}
        height={height}
        className={className}
        unoptimized
        priority={priority}
        onError={() => {
          if (hasFailed || currentSrc === FALLBACK_IMAGE_SRC) return;
          setHasFailed(true);
          setCurrentSrc(FALLBACK_IMAGE_SRC);
        }}
      />
    );
  }

  // Fallback for remote/legacy image URLs that may not be compatible with next/image config yet.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={safeSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={priority ? "eager" : "lazy"}
      onError={(event) => {
        const target = event.currentTarget;
        if (target.src.endsWith(FALLBACK_IMAGE_SRC)) return;
        target.src = FALLBACK_IMAGE_SRC;
      }}
    />
  );
}
