const nextConfig = {distDir: process.env.HOMAY_BUILD_DIRECTORY || '.next', experimental:{serverComponentsExternalPackages:['better-sqlite3','pdfkit','exceljs']},async headers(){return [{source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'}]}];}};
export default nextConfig;
