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
      // the raw vercel.app URL. /fonts and /logos are its self-hosted
      // public-folder assets (not covered by that app's assetPrefix, since
      // they're referenced as plain root-relative paths in CSS/metadata) —
      // neither namespace is used by this app, so proxying them here is safe.
      {
        source: "/onboard",
        destination: "https://amplifi-inc-sprint.vercel.app/onboard",
      },
      {
        source: "/fonts/:path*",
        destination: "https://amplifi-inc-sprint.vercel.app/fonts/:path*",
      },
      {
        source: "/logos/:path*",
        destination: "https://amplifi-inc-sprint.vercel.app/logos/:path*",
      },
    ];
  },
};

export default nextConfig;
