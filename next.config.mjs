const nextConfig = {
  distDir: process.env.HOMAY_BUILD_DIRECTORY || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3", "pdfkit", "exceljs", "sharp"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/register",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/account",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};
export default nextConfig;
