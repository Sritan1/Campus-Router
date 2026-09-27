import type { Metadata } from "next";

// a page that sets openGraph loses the file image, so name it
const IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630 };

export function shareCard(title: string, description: string, path: string): Metadata {
  return {
    description,
    openGraph: {
      type: "website",
      siteName: "Campus Router",
      title,
      description,
      url: path,
      images: [IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [IMAGE] },
  };
}

// a bare host would fail the build, and vercel fills in a missing one
export function siteUrl(raw: string | undefined): URL | undefined {
  const value = (raw || process.env.VERCEL_PROJECT_PRODUCTION_URL)?.trim();
  if (!value) {
    return undefined;
  }
  return new URL(value.includes("://") ? value : `https://${value}`);
}
