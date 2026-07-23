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
};

export default nextConfig;
