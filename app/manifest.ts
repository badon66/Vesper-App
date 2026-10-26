import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Icons are generated from brand/icon.svg
// by `npm run icons`.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Vesper",
    short_name: "Vesper",
    description: "Internal sales app for Vesper Lighting.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#0c1b26",
    theme_color: "#132e3f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
