#!/usr/bin/env node
/**
 * Guard: no stylesheet the app loads may `@import` a remote URL.
 *
 * A remote `@import` (e.g. Puck's `@import "https://rsms.me/inter/inter.css"`)
 * makes the whole CSS chunk fail when that host is unreachable — blocked
 * network, ad blocker, outage. For a `next/dynamic` component like the New
 * Builder that rejects the dynamic import and crashes the page, so a font
 * problem became a missing editor. Fonts must be bundled (next/font) or
 * come from the system stack, never fetched from a third-party host at
 * runtime.
 *
 * Checks:
 *   1. every .css file under src/
 *   2. every CSS file imported from src/ (package or relative specifier),
 *      resolved through the package's `exports`
 *   3. built CSS under .next/static, when a build exists
 *
 * Run: node scripts/check-no-remote-css.mjs   (part of `pnpm lint`)
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const REMOTE_IMPORT = /@import\s+(?:url\(\s*)?["']?\s*(?:https?:)?\/\//i;

const problems = [];

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

function checkCssFile(file, via) {
  const css = readFileSync(file, "utf8");
  css.split("\n").forEach((line, i) => {
    if (REMOTE_IMPORT.test(line)) {
      problems.push(`${path.relative(ROOT, file)}:${i + 1}${via ? ` (imported by ${via})` : ""}: ${line.trim().slice(0, 120)}`);
    }
  });
}

// 1. Our own stylesheets.
const srcCss = walk(path.join(ROOT, "src"), [".css"]);
for (const f of srcCss) checkCssFile(f);

// 2. Stylesheets imported from source files.
const CSS_IMPORT = /^\s*import\s+["']([^"']+\.css)["'];?\s*$/gm;
const seen = new Set();
for (const f of walk(path.join(ROOT, "src"), [".ts", ".tsx", ".js", ".jsx", ".mjs"])) {
  const code = readFileSync(f, "utf8");
  for (const m of code.matchAll(CSS_IMPORT)) {
    const spec = m[1];
    let resolved;
    try {
      resolved = spec.startsWith(".")
        ? path.resolve(path.dirname(f), spec)
        : spec.startsWith("@/")
          ? path.join(ROOT, "src", spec.slice(2))
          : require.resolve(spec);
    } catch {
      problems.push(`${path.relative(ROOT, f)}: cannot resolve stylesheet "${spec}"`);
      continue;
    }
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (existsSync(resolved)) checkCssFile(resolved, path.relative(ROOT, f));
  }
}

// 3. Built output, when present.
const built = walk(path.join(ROOT, ".next", "static"), [".css"]);
for (const f of built) checkCssFile(f);

if (problems.length) {
  console.error("✗ Remote CSS @import found — the page breaks when that host is blocked. Bundle the font or use the system stack:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`✓ No remote CSS @import — ${srcCss.length} source stylesheets, ${seen.size} imported stylesheets${built.length ? `, ${built.length} built stylesheets` : ""} checked.`);
