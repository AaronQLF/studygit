// Plain string constants for the HTTP headers the AI client/server pair
// exchange. Lives in its own file (no "use client" directive) so it can
// be imported by both:
//   - lib/ai-settings.ts (client-only — localStorage helpers, dialog)
//   - app/api/ai/route.ts (server-only — reads headers off requests)
//
// If these constants lived inside ai-settings.ts (which is marked
// "use client"), the Next.js boundary would replace the exported strings
// with stub functions on the server, causing `request.headers.get(...)`
// to receive an invalid (function-typed) header name.

export const AI_HEADER_BASE_URL = "x-ai-base-url";
export const AI_HEADER_API_KEY = "x-ai-api-key";
export const AI_HEADER_MODEL = "x-ai-model";
