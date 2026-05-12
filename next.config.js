/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Amazon
      { protocol: 'https', hostname: '**.amazon.com' },
      { protocol: 'https', hostname: '**.ssl-images-amazon.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      // Etsy
      { protocol: 'https', hostname: '**.etsystatic.com' },
      // Walmart
      { protocol: 'https', hostname: 'i5.walmartimages.com' },
      // Target
      { protocol: 'https', hostname: 'target.scene7.com' },
      // Sephora
      { protocol: 'https', hostname: '**.sephora.com' },
      // Generic CDN patterns
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**.shopify.com' },
      { protocol: 'https', hostname: '**.shopifycdn.com' },
    ],
  },
}

module.exports = nextConfig
