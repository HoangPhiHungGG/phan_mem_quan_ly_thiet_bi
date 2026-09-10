import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

const configureNext = (phase) => ({
  ...nextConfig,
  // Keep builds and browser checks from overwriting a running dev server.
  distDir:
    process.env.NEXT_DIST_DIR ??
    (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
});

export default configureNext;
