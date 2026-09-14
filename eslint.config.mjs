import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts de debug manual en la raíz (test-contact-flow.js,
    // test-local-flows.ts, test-with-login.js) -- no son parte de la app
    // Next.js, no corren en CI, se ejecutan a mano con `node`/`tsx` durante
    // desarrollo. Forzarlos por las reglas TS/ESM del resto del código
    // (no-require-imports, no-explicit-any) no aporta nada real y en el
    // caso de los .js CommonJS directamente los rompería si se
    // "corrigieran" a import/export.
    "test-*.js",
    "test-*.ts",
  ]),
]);

export default eslintConfig;
