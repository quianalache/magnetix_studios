/**
 * Imported websites (2026-11-20) — interactive AI-generated pages with their
 * own JavaScript, CSS, images and fonts. Pure, dependency-free contract shared
 * by the browser (import UI, block renderer), the server (bundle service) and
 * the content route.
 *
 * SECURITY MODEL — imported code never runs on the Magnetix app origin:
 *   1. Files are served ONLY by `/imported/...` on a SEPARATE content origin
 *      (`NEXT_PUBLIC_IMPORTED_CONTENT_ORIGIN`). That origin must be a different
 *      SITE from the app (not a *.magnetixstudios.com subdomain — a sibling
 *      subdomain is same-site, so SameSite=Lax session cookies would still be
 *      sent). The route refuses every request on any other host. Unset = the
 *      feature is OFF and imports stay static (the 2026-10-26 sanitized block).
 *   2. Every response carries `Content-Security-Policy: sandbox …` WITHOUT
 *      allow-same-origin, and the embedding iframe has the same sandbox: the
 *      page runs in a fresh opaque origin — no cookies, no storage shared with
 *      other creators' pages, no access to the parent page.
 *   3. The CSP lets scripts load from the bundle and HTTPS CDNs but allows
 *      network calls (fetch / XHR / WebSocket) only back to the content origin,
 *      and NO form submissions — forms reach Magnetix only through the narrow
 *      form bridge (a postMessage the host page validates and forwards to the
 *      existing public Forms endpoint for a form connected to that page).
 *   4. The host page trusts nothing from the frame except two message types,
 *      checked against the exact iframe window.
 */

export const IMPORTED_SITE_LIMITS = {
  files: 300,
  fileBytes: 3_000_000,
  totalBytes: 25_000_000,
  /** Zip archives: claimed + actual uncompressed size caps (decompression bombs). */
  zipBytes: 20_000_000,
  pathLength: 200,
  pathDepth: 8,
} as const;

/** Allowed file types → served content type. Anything else is refused. */
export const IMPORTED_SITE_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export const IMPORTED_SITE_ROUTE = "/imported";
export const SITE_FORM_MESSAGE = "mx-site-form";
export const SITE_FORM_RESULT_MESSAGE = "mx-site-form-result";

export const fileExtension = (path: string) => (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? "").toLowerCase();
export const isHtmlPath = (path: string) => /\.html?$/i.test(path);
export const isAllowedSiteFile = (path: string) => fileExtension(path) in IMPORTED_SITE_TYPES;

/**
 * Normalizes one file path from a zip / folder upload, or null when unsafe:
 * no absolute paths, drive letters, backslash tricks, `..`, control
 * characters, hidden / OS metadata files, or overly deep / long paths.
 */
export function normalizeSitePath(raw: string): string | null {
  if (typeof raw !== "string") return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  const p = raw.replace(/\\/g, "/");
  if (p.startsWith("/") || /^[a-z]:/i.test(p)) return null;
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return null;
    if (seg.startsWith(".") || seg === "__MACOSX" || seg === "Thumbs.db" || seg === "desktop.ini") return null;
    if (!/^[A-Za-z0-9 _@()+,=~.-]+$/.test(seg)) return null;
    parts.push(seg);
  }
  if (!parts.length || parts.length > IMPORTED_SITE_LIMITS.pathDepth) return null;
  const out = parts.join("/");
  return out.length > IMPORTED_SITE_LIMITS.pathLength ? null : out;
}

/** Removes a single shared top folder ("my-site/index.html" → "index.html"). */
export function stripCommonRoot(paths: string[]): (p: string) => string {
  const first = paths[0]?.split("/")[0];
  const shared = !!first && paths.length > 0 && paths.every((p) => p.includes("/") && p.split("/")[0] === first);
  return shared ? (p) => p.slice(first!.length + 1) : (p) => p;
}

/** The entry page: index.html at the top, else the only top-level HTML file. */
export function pickEntry(paths: string[]): string | null {
  if (paths.includes("index.html")) return "index.html";
  if (paths.includes("index.htm")) return "index.htm";
  const top = paths.filter((p) => !p.includes("/") && isHtmlPath(p));
  return top.length === 1 ? top[0] : null;
}

function registrableHost(host: string): string {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h === "localhost") return h;
  const parts = h.split(".");
  // vercel.app etc. are public suffixes: the project subdomain is its own site.
  if (parts.length >= 3 && /^(vercel\.app|netlify\.app|pages\.dev|web\.app|firebaseapp\.com)$/.test(parts.slice(-2).join("."))) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

/**
 * The separate content origin, or null when interactive imports are OFF.
 * Refused (null) unless it is a different SITE from the app origin.
 */
export function importedContentOrigin(env: { content?: string | null; app?: string | null } = {
  content: process.env.NEXT_PUBLIC_IMPORTED_CONTENT_ORIGIN ?? null,
  app: process.env.NEXT_PUBLIC_APP_URL ?? null,
}): string | null {
  const raw = (env.content ?? "").trim();
  if (!raw) return null;
  let content: URL;
  try {
    content = new URL(raw);
  } catch {
    return null;
  }
  const local = content.hostname === "127.0.0.1" || content.hostname === "localhost";
  if (content.protocol !== "https:" && !(local && content.protocol === "http:")) return null;
  if (env.app) {
    try {
      const app = new URL(env.app);
      if (registrableHost(app.host) === registrableHost(content.host)) return null;
    } catch {
      return null;
    }
  }
  return content.origin;
}

export function siteFileUrl(origin: string, bundleId: string, path: string): string {
  return `${origin}${IMPORTED_SITE_ROUTE}/${bundleId}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Sandbox tokens for the frame (never allow-same-origin). Editing = no navigation, no forms. */
export function siteSandbox(mode: "editing" | "visitor"): string {
  return mode === "editing"
    ? "allow-scripts"
    : "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation";
}

/** CSP for every file served from the content origin. */
export function siteResponseCsp(contentOrigin: string): string {
  return [
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation",
    "default-src 'none'",
    `script-src ${contentOrigin} 'unsafe-inline' 'unsafe-eval' https:`,
    `style-src ${contentOrigin} 'unsafe-inline' https:`,
    `img-src ${contentOrigin} https: data: blob:`,
    `font-src ${contentOrigin} https: data:`,
    `media-src ${contentOrigin} https: blob:`,
    `connect-src ${contentOrigin}`,
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
  ].join("; ");
}

/**
 * Injected first into every served HTML page:
 *  - in-memory localStorage / sessionStorage when the opaque origin has none
 *    (so common theme / menu scripts don't crash);
 *  (The frame is one screen tall and the site scrolls inside it, like a
 *  normal website — auto-height would run away on `min-height: 100vh` heroes.)
 *  - links to other sites open the page itself (top), links to the bundle's
 *    own pages stay in the frame;
 *  - the form bridge: `<form data-magnetix-form="FORM_ID">` posts its fields
 *    to the host page; any other form is held (no third-party submission).
 */
export const SITE_SHIM_SCRIPT = `(function(){
function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("x")}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}});
document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a||a.target)return;var h=a.getAttribute("href")||"";if(!h||h.charAt(0)==="#")return;try{var u=new URL(h,location.href);if(u.origin!==location.origin&&/^https?:$/.test(u.protocol))a.target="_top"}catch(_){}},true);
window.addEventListener("submit",function(e){var f=e.target;if(!f||e.defaultPrevented)return;e.preventDefault();var id=f.getAttribute("data-magnetix-form");if(!id){f.setAttribute("data-magnetix-form-status","not-connected");return}var v={};new FormData(f).forEach(function(val,k){if(typeof val==="string"){v[k]=v[k]?v[k]+", "+val:val}});f.setAttribute("data-magnetix-form-status","sending");parent.postMessage({type:"${SITE_FORM_MESSAGE}",formId:id,values:v},"*")});
window.addEventListener("message",function(e){if(e.source!==parent||!e.data||e.data.type!=="${SITE_FORM_RESULT_MESSAGE}")return;var fs=document.querySelectorAll('form[data-magnetix-form="'+String(e.data.formId).replace(/"/g,"")+'"]');fs.forEach(function(f){f.setAttribute("data-magnetix-form-status",e.data.ok?"sent":"error");f.dispatchEvent(new CustomEvent("magnetix:form-result",{detail:{ok:!!e.data.ok,message:String(e.data.message||"")},bubbles:true}));if(e.data.ok&&!f.hasAttribute("data-magnetix-keep")){var m=document.createElement("p");m.setAttribute("role","status");m.textContent=f.getAttribute("data-magnetix-success")||"Thanks! We got your details.";f.replaceWith(m)}})});
})();`;

/** Inserts the shim as the first thing in <head> (or the document). */
export function injectSiteShim(html: string): string {
  const tag = `<script>${SITE_SHIM_SCRIPT}</script>`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  return `${tag}${html}`;
}

const REF_ATTR = /\s(?:src|href|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** Forms the page connects to Magnetix (`data-magnetix-form="ID"`). */
export function connectedFormIds(html: string): string[] {
  const ids = new Set<string>();
  const re = /data-magnetix-form\s*=\s*["']([A-Za-z0-9_-]{1,64})["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) ids.add(m[1]);
  return [...ids].slice(0, 20);
}

/**
 * Relative references in the bundle's HTML / CSS that don't resolve to an
 * uploaded file (missing from the export), plus plain-http references.
 */
export function findUnresolvedSiteRefs(files: Record<string, string>, allPaths: string[] = Object.keys(files)): string[] {
  const have = new Set(allPaths);
  const missing = new Set<string>();
  const check = (fromPath: string, ref: string) => {
    const t = ref.trim();
    if (!t || t.startsWith("#") || /^(data|blob|mailto|tel|sms|javascript):/i.test(t)) return;
    if (/^http:\/\//i.test(t)) return void missing.add(t);
    if (/^(https:)?\/\//i.test(t)) return;
    const clean = t.split(/[?#]/)[0];
    if (!clean) return;
    const base = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/") + 1) : "";
    const joined = clean.startsWith("/") ? clean.slice(1) : base + clean;
    const parts: string[] = [];
    for (const seg of joined.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg && seg !== ".") parts.push(seg);
    }
    let target = parts.join("/");
    try {
      target = decodeURIComponent(target);
    } catch {
      /* keep raw */
    }
    if (!have.has(target) && !have.has(`${target}/index.html`)) missing.add(t);
  };
  for (const [path, text] of Object.entries(files)) {
    if (isHtmlPath(path)) {
      let m: RegExpExecArray | null;
      REF_ATTR.lastIndex = 0;
      while ((m = REF_ATTR.exec(text))) check(path, m[2] ?? m[3] ?? m[4] ?? "");
    }
    if (isHtmlPath(path) || fileExtension(path) === "css") {
      const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) check(path, m[2] ?? m[4] ?? "");
    }
  }
  return [...missing].slice(0, 40);
}

/** Facts the block keeps about an imported website bundle. */
export interface ImportedSiteRef {
  bundleId: string;
  entry: string;
  fileCount: number;
  totalBytes: number;
  scripts: number;
  forms: string[];
}

export function normalizeImportedSiteRef(v: unknown): ImportedSiteRef | undefined {
  if (!v || typeof v !== "object") return undefined;
  const s = v as Partial<ImportedSiteRef>;
  if (typeof s.bundleId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(s.bundleId)) return undefined;
  const entry = typeof s.entry === "string" ? normalizeSitePath(s.entry) : null;
  if (!entry || !isHtmlPath(entry)) return undefined;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  return {
    bundleId: s.bundleId,
    entry,
    fileCount: n(s.fileCount),
    totalBytes: n(s.totalBytes),
    scripts: n(s.scripts),
    forms: Array.isArray(s.forms) ? s.forms.filter((f): f is string => typeof f === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(f)).slice(0, 20) : [],
  };
}
