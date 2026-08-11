import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Emits `.next/standalone` — a self-contained server with only the traced
   * dependencies, so the production image does not need `node_modules`
   * installed. This is what keeps the Docker image small.
   *
   * `better-sqlite3` is a native module, but Next already treats it as an
   * external server package by default, so it is required at runtime rather
   * than bundled and its compiled `.node` binary is traced into the output.
   */
  output: "standalone",
};

export default nextConfig;
