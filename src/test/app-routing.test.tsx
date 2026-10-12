import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";

import { routes } from "@/router";

// Match routes without running loaders or rendering: loaders may need a network
// the test run lacks, and jsdom never loads the stylesheets the app relies on.
describe("App routing", () => {
  const leaf = (path: string) => matchRoutes(routes, path)?.at(-1)?.route;

  it("matches a page for / instead of falling back to not found", () => {
    expect(leaf("/")?.index).toBe(true);
  });

  it.each(["/app", "/signin", "/signup"])("matches a page for %s", (path) => {
    expect(leaf(path)?.path).toBe(path.slice(1));
  });

  it("guards /app behind the authenticated loader", () => {
    const ids = matchRoutes(routes, "/app")?.map((m) => m.route.id);
    expect(ids).toContain("authenticated");
  });

  it("falls back to not found for unknown paths", () => {
    expect(leaf("/nope")?.path).toBe("*");
  });
});
