/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep Playwright (used only by the opt-in Browser Automation provider in
    // the Node API route) out of the webpack bundle/trace — it's a heavy native
    // package with browser binaries that must be resolved at runtime, not bundled.
    serverComponentsExternalPackages: ["playwright", "playwright-core"],
  },
};

export default nextConfig;
