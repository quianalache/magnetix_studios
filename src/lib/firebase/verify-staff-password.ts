import "server-only";

/**
 * Unified CRM + Community credential auth (2026-08-24) — verifies a
 * plaintext password against Firebase Authentication itself (the ONE
 * credential authority CRM/staff users already have), without ever
 * touching or duplicating a password hash ourselves. Firebase Auth's own
 * managed password store is not readable by the Admin SDK (by design —
 * there is no `adminAuth.verifyPassword`), so this calls the Identity
 * Toolkit REST API's `accounts:signInWithPassword` endpoint, which is
 * exactly what the Firebase Auth Client SDK's own
 * `signInWithEmailAndPassword` (see `lib/firebase/auth.ts`, used by the
 * CRM's own staff login form) does under the hood — this is not a new or
 * unusual credential path, just the server-side equivalent of the same
 * call.
 *
 * `NEXT_PUBLIC_FIREBASE_API_KEY` is safe to use server-side here: it's a
 * public, client-restricted identifier already shipped in every browser
 * bundle (every Firebase web app embeds it) — it authorizes WHICH Firebase
 * project to talk to, it is not a secret credential itself. Google's own
 * rate limiting/lockout on repeated failed password attempts applies here
 * exactly as it would to the CRM's own login form; this codebase's
 * existing `checkMemberAuthRateLimit` wraps the calling route as an
 * additional layer.
 *
 * Never logs, stores, or returns the password. Returns `false` (never
 * throws) on any network/API failure, invalid credentials, or missing
 * config — a verification failure here must always be indistinguishable
 * from "wrong password," never surfaced as a 500.
 */
export async function verifyFirebaseAuthPassword(
  email: string,
  password: string,
): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey || !password) return false;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          returnSecureToken: false,
        }),
      },
    );
    return res.ok;
  } catch (err) {
    console.error("[verifyFirebaseAuthPassword] request failed", err);
    return false;
  }
}
