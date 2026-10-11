export const googleClientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

export const GOOGLE_SETUP_MESSAGE =
  "Add your Google client ID to continue. Create a Web client in Google Cloud Console, set VITE_GOOGLE_CLIENT_ID in a .env file, and restart the app.";

let googleScript;

export function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (googleScript) return googleScript;

  googleScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
        return;
      }
      googleScript = null;
      reject(new Error("Google sign-in loaded, but it was not ready to use."));
    };
    script.onerror = () => {
      googleScript = null;
      reject(new Error("Could not reach Google. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });

  return googleScript;
}

const GOOGLE_CANCEL_CODES = new Set([
  "popup_closed",
  "popup_closed_by_user",
  "access_denied",
  "user_cancelled",
  "user_cancel",
]);

export function isGoogleCancelCode(error) {
  return GOOGLE_CANCEL_CODES.has(error);
}

export function googleCancelled() {
  const error = new Error("Google sign-in was cancelled.");
  error.code = "google-cancelled";
  return error;
}

export function isGoogleCancellation(error) {
  return error?.code === "google-cancelled";
}

export function googleErrorMessage(error) {
  if (isGoogleCancelCode(error)) {
    return "Google sign-in was cancelled.";
  }
  if (error === "popup_failed_to_open") {
    return "The Google window was blocked. Allow pop-ups for this site and try again.";
  }
  return "Google sign-in did not finish. Confirm this site is an authorized JavaScript origin for your client ID, then try again.";
}

export async function fetchGoogleProfile(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error("Google did not return an account profile.");
  }

  const profile = await response.json();
  if (!profile?.sub) {
    throw new Error("Google did not return an account id.");
  }

  const email = typeof profile.email === "string" ? profile.email : "";
  const name = profile.name || email || "Google account";
  return {
    providerId: `google:${profile.sub}`,
    method: "google",
    name,
    email,
    walletAddress: "",
  };
}

export function revokeGoogleToken(accessToken) {
  const revoke = window.google?.accounts?.oauth2?.revoke;
  if (!revoke || !accessToken) return;
  try {
    revoke(accessToken, () => {});
  } catch {
    // The profile is already saved. Dropping the Google token is best-effort.
  }
}

if (typeof window !== "undefined" && googleClientId) {
  loadGoogleIdentity().catch(() => {});
}
