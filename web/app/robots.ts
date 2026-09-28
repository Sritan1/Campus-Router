import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/share";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? new URL("http://localhost:3000");
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", base).href,
  };
}
