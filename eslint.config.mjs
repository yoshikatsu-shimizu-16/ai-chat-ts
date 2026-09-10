import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".vinext/**",
    ".wrangler/**",
    "dist/**",
    "node_modules/**",
    "*.tsbuildinfo",
  ]),
]);
