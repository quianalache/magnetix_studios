/*!
 * Magnetix Public Reading Tool — website install loader.
 *
 *   <script src="https://YOUR-MAGNETIX-DOMAIN/reading-tool.js"
 *           data-embed-url="https://YOUR-MAGNETIX-DOMAIN/decoder/SUB?embed=ID" async></script>
 *
 * Inserts the Reading Tool iframe right where the tag sits, keeps it as tall
 * as its content, and forwards this page's campaign parameters (utm_*,
 * fbclid, gclid) plus its hostname, so a Reading submitted here carries the
 * same attribution Magnetix records everywhere else.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var embedUrl = script.getAttribute("data-embed-url");
  if (!embedUrl) return;

  var src;
  try {
    src = new URL(embedUrl, script.src);
  } catch (e) {
    return;
  }
  var here = new URL(window.location.href);
  var forward = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];
  for (var i = 0; i < forward.length; i++) {
    var v = here.searchParams.get(forward[i]);
    if (v && !src.searchParams.has(forward[i])) src.searchParams.set(forward[i], v);
  }
  src.searchParams.set("embedded", "1");
  src.searchParams.set("host", window.location.hostname);

  var frame = document.createElement("iframe");
  frame.src = src.toString();
  frame.title = script.getAttribute("data-title") || "Reading";
  frame.loading = "lazy";
  frame.setAttribute("allow", "clipboard-write");
  frame.style.width = "100%";
  frame.style.border = "0";
  frame.style.display = "block";
  frame.style.minHeight = "640px";
  frame.style.background = "transparent";
  script.parentNode.insertBefore(frame, script.nextSibling);

  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow) return;
    var data = event.data;
    if (!data || data.type !== "magnetix:reading-tool:height") return;
    var h = Number(data.height);
    if (h > 0 && h < 20000) frame.style.height = h + "px";
  });
})();
