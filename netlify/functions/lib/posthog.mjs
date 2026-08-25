// PostHog server-side analytics for Netlify Functions.
// Uses posthog-node with flushAt:1 / flushInterval:0 so every event is sent
// immediately — required in serverless environments where the process may be
// frozen/torn-down before a batched flush runs.
//
// Guard: if POSTHOG_API_KEY is absent the client is not created and all
// exported helpers become no-ops so the app still boots and handles requests.
// In non-production environments we throw loudly so the omission is visible.
import { PostHog } from 'posthog-node';

const apiKey = process.env.POSTHOG_API_KEY;
const host = process.env.POSTHOG_HOST;

if (!apiKey && process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-console
  console.error(
    'POSTHOG_API_KEY variable required by PostHog is missing or un-configured, ' +
    'this causes events to be silently missed. ' +
    'This error stops appearing once POSTHOG_API_KEY is configured',
  );
}

/** Shared PostHog client, or null when the key is not configured. */
export const posthog = apiKey
  ? new PostHog(apiKey, {
      host: host || 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
      enableExceptionAutocapture: true,
    })
  : null;

/**
 * Flush pending events. Call this before returning a response from a
 * serverless function to guarantee the event is delivered.
 */
export async function flushPostHog() {
  if (posthog) await posthog.flush();
}
