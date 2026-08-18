import type { SuggestionOptions } from "@tiptap/suggestion";

/**
 * Shared @ mention / # channel-reference suggestion dropdown — ONE
 * factory both `community-mention-extensions.ts` node configs build their
 * `suggestion` option from, per the Phase D instruction not to build two
 * independent autocomplete systems. Deliberately vanilla DOM (no tippy.js/
 * popper dependency): TipTap's suggestion util hands back a `clientRect`
 * for the current cursor position, which is all a fixed-position dropdown
 * needs — adding a positioning library for this one dropdown wasn't
 * justified.
 */
export interface MentionSuggestionItem {
  id: string;
  label: string;
  avatarUrl?: string | null;
}

export function buildMentionSuggestion(opts: {
  char: "@" | "#";
  fetchItems: (query: string) => Promise<MentionSuggestionItem[]>;
}): Omit<SuggestionOptions<MentionSuggestionItem>, "editor"> {
  return {
    char: opts.char,
    allowSpaces: false,
    items: async ({ query }) => opts.fetchItems(query),
    render: () => {
      let el: HTMLDivElement | null = null;
      let items: MentionSuggestionItem[] = [];
      let selected = 0;
      let onPick: ((item: MentionSuggestionItem) => void) | null = null;

      function draw() {
        if (!el) return;
        el.innerHTML = "";
        if (items.length === 0) {
          const empty = document.createElement("div");
          empty.textContent = "No matches";
          empty.style.cssText = "padding:8px 12px;font-size:13px;color:#909090;";
          el.appendChild(empty);
          return;
        }
        items.forEach((item, i) => {
          const row = document.createElement("button");
          row.type = "button";
          row.textContent = `${opts.char}${item.label}`;
          row.style.cssText = [
            "display:block",
            "width:100%",
            "text-align:left",
            "padding:6px 12px",
            "font-size:13px",
            "border:0",
            "background:" + (i === selected ? "#F0F0F0" : "transparent"),
            "color:#202124",
            "cursor:pointer",
          ].join(";");
          row.addEventListener("mousedown", (e) => {
            // Prevent the editor from losing focus/selection before the
            // command runs — same fix as the rich-text toolbar buttons.
            e.preventDefault();
            onPick?.(item);
          });
          el!.appendChild(row);
        });
      }

      function position(clientRect: (() => DOMRect | null) | null | undefined) {
        if (!el) return;
        const rect = clientRect?.();
        if (!rect) return;
        el.style.left = `${rect.left + window.scrollX}px`;
        el.style.top = `${rect.bottom + window.scrollY + 4}px`;
      }

      return {
        onStart: (props) => {
          el = document.createElement("div");
          el.style.cssText = [
            "position:absolute",
            "z-index:80",
            "min-width:160px",
            "max-width:260px",
            "max-height:220px",
            "overflow-y:auto",
            "border-radius:10px",
            "border:1px solid #E4E4E4",
            "background:#fff",
            "box-shadow:0 8px 24px rgba(0,0,0,0.12)",
            "padding:4px",
          ].join(";");
          document.body.appendChild(el);
          items = props.items;
          selected = 0;
          onPick = (item) => props.command(item);
          draw();
          position(props.clientRect);
        },
        onUpdate: (props) => {
          items = props.items;
          selected = 0;
          onPick = (item) => props.command(item);
          draw();
          position(props.clientRect);
        },
        onKeyDown: (props) => {
          if (!el) return false;
          if (props.event.key === "ArrowDown") {
            selected = (selected + 1) % Math.max(items.length, 1);
            draw();
            return true;
          }
          if (props.event.key === "ArrowUp") {
            selected = (selected - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1);
            draw();
            return true;
          }
          if (props.event.key === "Enter") {
            if (items[selected]) onPick?.(items[selected]);
            return true;
          }
          if (props.event.key === "Escape") {
            el.remove();
            el = null;
            return true;
          }
          return false;
        },
        onExit: () => {
          el?.remove();
          el = null;
        },
      };
    },
  };
}
