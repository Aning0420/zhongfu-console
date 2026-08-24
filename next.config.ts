import type { NextConfig } from 'next';

const isStaticExport = process.env.ZHONGFU_STATIC_EXPORT === '1';
const basePath = isStaticExport ? '/zhongfu-console' : '';

const nextConfig: NextConfig = {
  output: isStaticExport ? 'export' : undefined,
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: isStaticExport,
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    unoptimized: isStaticExport,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

if (!isStaticExport) {
  nextConfig.headers = async () => [
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
    {
      source: '/manifest.json',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
      ],
    },
  ];
}

export default nextConfig;
