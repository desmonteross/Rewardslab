/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // The Prisma-free data layer still keeps pg and bcrypt out of the bundle.
  serverExternalPackages: ['pg', 'bcryptjs'],
}

export default nextConfig
