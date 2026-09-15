import type { NextConfig } from "next";

/**
 * Response security headers.
 *
 * These are set here (rather than in `proxy.ts`) on purpose: `headers()` is
 * applied to *every* response the server produces — pages, route handlers, the
 * `.ics` feeds and static assets alike — whereas `proxy.ts` has a deliberately
 * narrow matcher (`/admin/:path*`, `/staff/:path*`) that exists to gate access,
 * and it never sees the public calendar or the feeds.
 *
 * `isProduction` is threaded through rather than read from `process.env` inside
 * each value so that `scripts/verify-phase6.mts` can assert the production
 * policy from the same source of truth the server uses. See the notes on HSTS
 * and `upgrade-insecure-requests` below for why those two are production-only.
 */
export function securityHeaders(isProduction: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isProduction) },
    // HSTS: the browser refuses plain HTTP to this origin for two years.
    //   1. `includeSubDomains` without `preload`: preload is a commitment to a
    //      real, submitted domain (hstspreload.org) and cannot be undone
    //      quickly, so it is left to the deployment to opt into.
    //   2. Production only. Browsers ignore STS over plain HTTP *except* for
    //      localhost, which every browser treats as a trustworthy origin — so
    //      sending it in development would pin http://localhost:3001 to HTTPS
    //      and break the local server for every other project on the machine.
    ...(isProduction
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ]
      : []),
    // Stops the browser second-guessing a Content-Type, which is what turns an
    // uploaded or reflected file into a script.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Send the origin (not the full path, which can carry an id) to other sites.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Superseded by CSP frame-ancestors, but still honoured by older browsers
    // (notably IE/legacy Edge) that never implemented the CSP directive.
    { key: "X-Frame-Options", value: "DENY" },
    // Acadex uses none of these; denying them removes a whole class of
    // social-engineering and fingerprinting surface from a calendar site.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];
}

/**
 * Content Security Policy.
 *
 * RELAXATIONS ACCEPTED, AND WHY
 *
 * `script-src 'self' 'unsafe-inline'` is the significant one. Next.js streams
 * the App Router payload to the browser as *inline* `<script>` elements
 * (`self.__next_f.push(...)`) — they are part of the HTML, not separate files,
 * so no `'self'`-only policy can execute them and the page renders as an empty
 * shell. `'unsafe-inline'` is therefore required by the framework as configured
 * here. What it costs is bounded by the rest of the app: every value that
 * reaches the DOM goes through React, which escapes it, and the codebase
 * contains no `dangerouslySetInnerHTML` and no HTML built by string
 * concatenation, so there is no injection point for an inline script to be
 * smuggled through. The remaining risk is an injected `<script>` tag from some
 * future feature; the nonce-based policy below is the fix when that matters.
 *
 * `style-src 'self' 'unsafe-inline'` is the second. Next.js inlines its
 * critical CSS and Tailwind ships as one stylesheet, and `CategoryChip` sets a
 * per-category colour through a `style` attribute. CSP treats a style
 * *attribute* as inline CSS, so dropping `'unsafe-inline'` here would need the
 * colour moved out of the attribute (a CSS custom property plus a hashed
 * stylesheet, or a class per category) before it could be tightened.
 *
 * `'unsafe-eval'` is added in development only: React uses `eval` to rebuild
 * server stack traces in the browser and Next.js' Fast Refresh needs it (see
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 * Production ships without it.
 *
 * `upgrade-insecure-requests` is production-only, for the same reason as HSTS:
 * on an `http://localhost` page the directive rewrites the page's own
 * same-origin requests to `https://localhost:3001`, which nothing is listening
 * for. The production deployment is HTTPS-terminated, so there the directive is
 * pure upside.
 *
 * WHAT A NONCE-BASED POLICY WOULD REQUIRE
 *
 *   1. `proxy.ts` would have to run on every route (its matcher widened from
 *      `/admin/:path*`,`/staff/:path*` to every document request) and generate a
 *      fresh nonce per request.
 *   2. The nonce must be set on the *request* headers so Next.js can attach it
 *      to the framework scripts and page bundles it emits; `script-src` would
 *      become `'self' 'nonce-…' 'strict-dynamic'` and `'unsafe-inline'` would
 *      go away (browsers ignore `'unsafe-inline'` once a nonce is present).
 *   3. Every page would have to be dynamically rendered — a nonce cannot exist
 *      in a document rendered at build time — which removes static caching for
 *      the whole site. Acadex's pages already read the session cookie or the
 *      database, so most of them are dynamic today; the ones that are not would
 *      have to opt in.
 *   4. Inline *style attributes* would still need `style-src-attr
 *      'unsafe-inline'` (or the CategoryChip change described above), because
 *      nonces do not apply to attributes.
 *
 * That is a real, worthwhile change, but it belongs with a deployment that
 * terminates TLS and has a measured caching story — not with this phase, whose
 * brief is to add a policy that demonstrably does not break the application.
 */
export function contentSecurityPolicy(isProduction: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    // `data:` and `blob:` are for the favicon and any in-page preview the
    // browser builds; no image is loaded from a third-party origin.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // No plugin content, and no <base> rewriting to redirect relative URLs.
    "object-src 'none'",
    "base-uri 'self'",
    // A form may only post back to this site — the login form and the admin
    // forms are all server actions on the same origin.
    "form-action 'self'",
    // Nothing may frame Acadex, and Acadex frames nothing.
    "frame-ancestors 'none'",
    "frame-src 'none'",
    // No third-party connections: no analytics, no beacons.
    "connect-src 'self'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}

const nextConfig: NextConfig = {
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";

    return [
      {
        // Every route, including the .ics feeds and the API handler. Path
        // patterns are anchored, so `/:path*` covers `/` and everything below.
        source: "/:path*",
        headers: securityHeaders(isProduction),
      },
    ];
  },

  experimental: {
    serverActions: {
      /**
       * Server-action request body limit.
       *
       * Next.js defaults to 1 MB. Acadex's actions take form fields and one
       * re-posted CSV, and the CSV is capped at 256 KB in
       * `lib/actions/admin-import.ts` — so 512 KB is double the largest
       * legitimate payload and still halves what an unauthenticated caller can
       * make the server buffer before any of our own validation runs. Anything
       * larger is refused by the framework before it is parsed.
       */
      bodySizeLimit: "512kb",
    },
  },
};

export default nextConfig;
