import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: dirname });

const config = [
  {
    ignores: [
      ".next/**",
      ".next-dev/**",
      ".next-issue-test/**",
      ".next-loan-test/**",
      ".next-warehouse-test/**",
      "out/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
