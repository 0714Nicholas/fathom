const longCache = [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }]

const nextConfig = {
    reactStrictMode: true,
    async headers() {
      return [
        {
          // Service Worker は常に最新を取りに行かせる
          source: '/sw.js',
          headers: [
            { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
            { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          ],
        },
        { source: '/fonts/:path*', headers: longCache },
      ]
    },
  }

  export default nextConfig
