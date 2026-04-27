/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  env: {
    PORT: process.env.PORT || '3000',
  },
}
module.exports = nextConfig
