/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/inc-sprint",
        destination: "https://amplifi-inc-sprint.vercel.app",
        permanent: false,
      },
      {
        source: "/inc-sprint/:path*",
        destination: "https://amplifi-inc-sprint.vercel.app/:path*",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      // Proxies amplifi-inc-sprint's /onboard page so it stays on this
      // domain (amplifi.chiibitsu.com/onboard) instead of redirecting to
      // the raw vercel.app URL. /logos is its self-hosted favicon, referenced
      // as a plain root-relative <link> href, so it resolves against this
      // document's origin and needs proxying here (not used by this app
      // itself, so safe). /fonts is NOT proxied here on purpose: those are
      // referenced from inside a stylesheet, which resolves root-relative
      // url()s against the *stylesheet's* origin rather than the document's
      // -- once assetPrefix makes that CSS load directly from
      // amplifi-inc-sprint.vercel.app, font requests never reach this origin
      // at all, so a rewrite here would be dead code. That app instead
      // CORS-allows /fonts for cross-origin loading (amplifi-inc-sprint PR #9).
      {
        source: "/onboard",
        destination: "https://amplifi-inc-sprint.vercel.app/onboard",
      },
      {
        source: "/logos/:path*",
        destination: "https://amplifi-inc-sprint.vercel.app/logos/:path*",
      },
    ];
  },
};

export default nextConfig;
