import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@hyperdrop/agent-core'],
  reactStrictMode: true,
};

export default nextConfig;
