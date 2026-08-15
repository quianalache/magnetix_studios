import "server-only";

/**
 * Server-side Firebase EMAIL/PASSWORD verification via the Identity
 * Toolkit REST API — NOT the Admin SDK (which has no password-verification
 * method at all; it only mints/verifies tokens, by design, since it's a
 * privileged credential that bypasses password checks entirely).
 *
 * This calls the EXACT SAME endpoint the Firebase Web SDK's own
 * signInWithEmailAndPassword() calls under the hood
 * (https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword),
 * using the public Firebase Web API key (NEXT_PUBLIC_FIREBASE_API_KEY —
 * already shipped to the browser, not a secret; it only identifies the
 * Firebase project). This is Firebase's own supported authentication
 * mechanism, used from the server instead of the browser — never reads,
 * copies, or stores a password hash, never touches Firebase Auth's
 * internal credential store directly.
 *
 * Used by MyMagnetix's unified-credential login (2026-08-17): a Person
 * who already has valid Business Center Firebase credentials can use
 * THOSE SAME credentials at /my/login instead of maintaining a second,
 * separate MyMagnetix password. This function only ever returns an
 * identity (a uid) — the caller is responsible for everything downstream
 * (resolving personId, deciding what that identity is allowed to do).
 * It grants nothing on its own.
 */
export async function verifyFirebasePassword(
  email: string,
  password: string,
): Promise<{ uid: string } | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      },
    );
    // Any non-200 (wrong password, no such account, disabled account,
    // malformed email) fails closed to null — deliberately not
    // distinguishing WHY to the caller, so no enumeration signal escapes
    // this function either.
    if (!res.ok) return null;

    const data = (await res.json()) as { localId?: string };
    if (!data.localId) return null;
    return { uid: data.localId };
  } catch (err) {
    console.warn("[firebase-rest-auth] verifyFirebasePassword request failed", err);
    return null;
  }
}
