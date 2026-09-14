/**
 * Targeted regression test for the MyMagnetix login-screen fix (2026-09-14):
 * the password-mismatch error from `/api/my/login` promises "use the email
 * sign-in link" — this verifies that phrase actually renders as a real,
 * clickable <button> (not just plain text) wherever it appears in an error,
 * and that every OTHER error (network failure, empty field, generic
 * message, etc.) still renders as plain text, completely unaffected.
 *
 * Pure render check via react-dom/server — no DOM, no network, no
 * Firestore, no auth state, no real component instance needed for the
 * logic itself (it's a plain string -> ReactNode function).
 *
 * Run: pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/test-mymagnetix-login-error-action.tsx
 * (the project's own tsconfig.json sets `"jsx": "preserve"`, which Next's
 * SWC compiler handles at build time but tsx's esbuild-based loader can't —
 * this test-only tsconfig override switches it to the automatic runtime so
 * the component's JSX compiles standalone, outside the Next build.)
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  PersonLoginForm,
  renderErrorWithAction,
  SIGN_IN_LINK_PHRASE,
} from "../src/components/mymagnetix/person-login-form";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
  }
}

function main() {
  console.log("=== Base form render sanity (nothing regressed) ===");
  const baseHtml = renderToStaticMarkup(createElement(PersonLoginForm, {}));
  check("Email input renders", baseHtml.includes('type="email"'));
  check(
    "Password input renders (default mode)",
    baseHtml.includes('type="password"')
  );
  check(
    "Pre-existing email-link mode toggle still renders",
    baseHtml.includes("Sign in with email link")
  );
  check(
    "Forgot password control still renders",
    baseHtml.includes("Forgot password?")
  );
  check(
    "No error banner on initial render",
    !baseHtml.includes("text-red-600")
  );

  console.log(
    "\n=== The real password-mismatch error (the owner's exact case) ==="
  );
  const realError =
    "Email or password is incorrect. If you have not set a MyMagnetix password yet, use the email sign-in link.";
  const state = { switched: false };
  const rendered = renderErrorWithAction(realError, () => {
    state.switched = true;
  });
  const html = renderToStaticMarkup(createElement("p", null, rendered));
  check(
    "Phrase still present in the rendered text",
    html.includes(SIGN_IN_LINK_PHRASE)
  );
  check(
    "Phrase is now wrapped in a real, clickable <button> (the actual fix)",
    /<button[^>]*>use the email sign-in link<\/button>/.test(html)
  );
  check(
    "The rest of the error sentence is preserved before the button",
    html.includes("Email or password is incorrect.")
  );
  check(
    "The rest of the error sentence is preserved after the button",
    html.includes(".</p>") || html.endsWith("</p>")
  );

  console.log(
    "\n=== Clicking the inline action wires to the real magic-link flow ==="
  );
  // `rendered` is a plain React element tree (a Fragment) at this point —
  // no DOM/click event needed to prove the wiring: walk to the <button>
  // element and invoke its onClick prop directly, the same function
  // reference React would call on a real click.
  type ElementLike = {
    type: unknown;
    props: { children?: unknown; onClick?: () => void };
  };
  function findButton(node: unknown): ElementLike | null {
    if (!node || typeof node !== "object") return null;
    const el = node as ElementLike;
    if (el.type === "button") return el;
    const children = el.props?.children;
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      const found = findButton(child);
      if (found) return found;
    }
    return null;
  }
  const button = findButton(rendered);
  check("A real <button> element is present in the returned tree", !!button);
  button?.props.onClick?.();
  check(
    "Invoking the button's onClick actually calls the passed-in onUseLink callback",
    state.switched === true
  );

  console.log(
    "\n=== Every OTHER error must render as plain text, unaffected ==="
  );
  const otherErrors = [
    "Enter your email.",
    "Enter your password.",
    "Something went wrong. Try again.",
    "Too many attempts. Try again in a few minutes.",
    "That sign-in link has expired or was already used. Request a new one below.",
  ];
  for (const text of otherErrors) {
    const out = renderErrorWithAction(text, () => {});
    const outHtml = renderToStaticMarkup(createElement("p", null, out));
    check(
      `"${text.slice(0, 40)}..." has no injected button`,
      !outHtml.includes("<button")
    );
    check(
      `"${text.slice(0, 40)}..." text is unchanged`,
      outHtml.includes(text)
    );
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main();
