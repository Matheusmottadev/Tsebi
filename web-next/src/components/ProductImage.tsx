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
  const { resolvedSrc, useNextImage } = resolveImageSource(src, imageBaseUrl);

  if (!resolvedSrc) {
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
        src={resolvedSrc}
        alt={alt}
        width={width}
        height={height}
        className={className}
        unoptimized
        priority={priority}
      />
    );
  }

  // Fallback for remote/legacy image URLs that may not be compatible with next/image config yet.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={priority ? "eager" : "lazy"}
    />
  );
}
