/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  // @mine — security (docs/SECURITY-NOTES.md): this app uses no `next/image`, no
  // Server Actions, no middleware and no rewrites. The optimizer surface is kept as
  // small as it can be — AVIF decoding (the subject of a Next.js advisory with no
  // 14.x fix) is switched off, remote images stay disallowed and SVG is refused.
  images: {
    formats: ['image/webp'],
    dangerouslyAllowSVG: false,
    remotePatterns: [],
  },
};

module.exports = nextConfig;
