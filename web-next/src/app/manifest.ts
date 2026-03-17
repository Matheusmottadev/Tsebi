import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tsebi Brasil",
    short_name: "Tsebi",
    description:
      "Moda autoral com coleções exclusivas, design contemporâneo e acabamento premium.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    lang: "pt-BR",
    dir: "ltr",
    orientation: "portrait-primary",
    categories: ["shopping", "fashion"],
    icons: [
      {
        src: "/images/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/pwa-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/images/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/images/screenshot-mobile.png",
        sizes: "736x1600",
        type: "image/png",
        label: "Tsebi Brasil — página inicial",
      },
      {
        src: "/images/screenshot-desktop.png",
        sizes: "1280x853",
        type: "image/png",
        form_factor: "wide",
        label: "Tsebi Brasil — página inicial desktop",
      },
    ],
    shortcuts: [
      {
        name: "Ver Produtos",
        url: "/products",
        description: "Explorar o catálogo completo",
        icons: [
          {
            src: "/images/pwa-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
