import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PATCHED,
  UNPATCHED,
  WRITE_ATOMIC,
  devServerPath,
  patchSource,
} from "../scripts/patch-next-prerender-manifest-write.mjs";

describe("patch-next-prerender-manifest-write", () => {
  it("replaces the non-atomic write exactly once", () => {
    const src = `a;\n${UNPATCHED}\nb;`;
    const r = patchSource(src);
    expect(r.status).toBe("patched");
    expect(r.source).toBe(`a;\n${PATCHED}\nb;`);
  });

  it("is idempotent", () => {
    const once = patchSource(`x ${UNPATCHED}`).source;
    expect(patchSource(once)).toEqual({ status: "already-patched", source: once });
  });

  it("leaves unknown or ambiguous sources alone", () => {
    expect(patchSource("nothing here").status).toBe("not-found");
    expect(patchSource(`${UNPATCHED}\n${UNPATCHED}`).status).toBe("not-found");
  });

  it("the patched line points at a helper that exists in the installed next", () => {
    const file = devServerPath();
    expect(file).toBeDefined();
    const helper = path.join(path.dirname(file!), `${WRITE_ATOMIC}.js`);
    expect(readFileSync(helper, "utf8")).toContain("function writeFileAtomic(");
  });

  // Fails when postinstall didn't run, or a Next upgrade changed the target
  // line — either way the e2e flake (a doubled prerender-manifest.json under
  // concurrent first requests) is back until the patch is revisited.
  it("the installed next dev server writes prerender-manifest.json atomically", () => {
    const source = readFileSync(devServerPath()!, "utf8");
    expect(source).toContain(PATCHED);
    expect(source).not.toContain(UNPATCHED);
  });
});
