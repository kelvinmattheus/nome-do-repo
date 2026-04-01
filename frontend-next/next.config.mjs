/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy API calls to backend during development
  async rewrites() {
    return process.env.NEXT_PUBLIC_API_URL
      ? []
      : [
          {
            source: '/api/:path*',
            destination: 'http://localhost:3000/:path*',
          },
        ];
  },
};

export default nextConfig;
