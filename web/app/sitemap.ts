import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/share";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? new URL("http://localhost:3000");
  return ["/", "/lab", "/about"].map((path) => ({ url: new URL(path, base).href }));
}
