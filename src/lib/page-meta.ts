import { useEffect } from "react";

type PageMeta = { title: string; description: string; ogDescription?: string };

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

// Client-side replacement for the per-route `head()` meta TanStack Start rendered on the server.
export function usePageMeta({ title, description, ogDescription = description }: PageMeta) {
  useEffect(() => {
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", ogDescription);
  }, [title, description, ogDescription]);
}
