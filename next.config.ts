import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) tenta montar um worker próprio ao ser importado — deixado
  // "externo" pro Next não empacotar esse código no bundle do servidor, o que quebrava a
  // resolução do arquivo do worker (pdf.worker.mjs) em runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
