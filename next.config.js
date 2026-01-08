/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Force browser to reload on updates
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
}

module.exports = nextConfig

