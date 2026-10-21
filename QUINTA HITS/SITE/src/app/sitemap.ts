import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { proximasEdicoes } from "@/lib/programacao";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Cada noite da agenda tem a própria página (/noite/<id>): entra no sitemap enquanto não passou.
  const noites = await proximasEdicoes(new Date(), 30).catch(() => []);
  return [
    { url: site.url, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${site.url}/programacao`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${site.url}/reservar`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    ...noites.map((e) => ({ url: `${site.url}/noite/${e.id}`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.6 })),
    { url: `${site.url}/privacidade`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
