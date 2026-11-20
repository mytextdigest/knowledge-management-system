/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // EKP E-12: SAML Jackson loads its database driver (TypeORM) at runtime;
  // bundling it breaks that, so it runs from node_modules.
  serverExternalPackages: ['@boxyhq/saml-jackson'],
  turbopack: {
    resolveAlias: {
      canvas: './src/lib/canvas-empty.js',
    },
  },
  images: {
    unoptimized: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
