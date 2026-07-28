import { Node } from "@tiptap/core";

/**
 * Generic inline embed — a TipTap block node for third-party embed codes that
 * aren't one of the 4 known video providers (`LessonVideo`): audio players,
 * countdown/scheduling widgets, forms, etc. Stored as a
 * `<div class="lesson-embed" data-src><iframe …></div>`, mirroring
 * `LessonVideo`'s shape so the sanitizer (lesson-html.ts) treats both the same
 * way — any `https://` iframe src survives, everything else (scripts, event
 * handlers, non-iframe embed tags) is stripped. In the editor the iframe has
 * pointer-events disabled so the node stays selectable/deletable.
 */

const ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lessonEmbed: {
      setLessonEmbed: (attrs: { src: string }) => ReturnType;
    };
  }
}

export const LessonEmbed = Node.create({
  name: "lessonEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-src"),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div.lesson-embed" }];
  },

  renderHTML({ node }) {
    const src = node.attrs.src as string | null;
    return [
      "div",
      { class: "lesson-embed", "data-src": src ?? "" },
      [
        "iframe",
        {
          src: src ?? "",
          allow: ALLOW,
          allowfullscreen: "true",
          frameborder: "0",
        },
      ],
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "lesson-embed";
      dom.setAttribute("data-src", node.attrs.src ?? "");
      const iframe = document.createElement("iframe");
      iframe.src = node.attrs.src ?? "";
      iframe.setAttribute("allow", ALLOW);
      iframe.setAttribute("allowfullscreen", "true");
      iframe.setAttribute("frameborder", "0");
      // Keep the node selectable/deletable in the editor (don't swallow clicks).
      iframe.style.pointerEvents = "none";
      dom.appendChild(iframe);
      return { dom };
    };
  },

  addCommands() {
    return {
      // Insert the atom + a trailing empty paragraph as ONE insertContent
      // call so the selection lands in that paragraph afterward instead of
      // staying a NodeSelection on the atom — otherwise a second insertion
      // right after (another embed, a video, an image) would REPLACE this
      // one instead of appending after it.
      setLessonEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent([
            { type: "lessonEmbed", attrs },
            { type: "paragraph" },
          ]),
    };
  },
});
