import type { MetadataRoute } from "next";
import { POSTS } from "@/components/blog/posts";
import { TOOLS } from "@/components/tools/registry";

const SITE = "https://timeiq.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/tools`, changeFrequency: "monthly", priority: 0.8 },
    ...TOOLS.map((t) => ({ url: `${SITE}/tools/${t.slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE}/blog`, changeFrequency: "weekly", priority: 0.7 },
    ...POSTS.map((p) => ({ url: `${SITE}/blog/${p.slug}`, lastModified: p.date, changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
