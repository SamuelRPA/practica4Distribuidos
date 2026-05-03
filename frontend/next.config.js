/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
  },
  async rewrites() {
    return [
      {
        source: '/api/sms/:path*',
        destination: 'http://localhost:3001/api/sms/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
