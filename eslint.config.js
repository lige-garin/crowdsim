import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.tmp/**",
      "**/dist/**",
      "**/coverage/**",
      "**/src/wasm/**",
      "node_modules/**",
      // Local-only e2e scratch (see .gitignore), not product code.
      "e2e-fs-patch.cjs",
      "output/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // Type-aware rules. These are the gate that catches the class of bug where a
    // rejected promise silently disappears (worker commands, evacuation trigger).
    files: ["packages/*/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/setupTests.ts"],
    languageOptions: {
      parserOptions: {
        // tsconfig.test.json includes all of src (the build tsconfig of some
        // packages only includes the entry point, which leaves leaf modules
        // unparsable for type-aware rules).
        project: [
          "./packages/app/tsconfig.json",
          "./packages/core-gpu/tsconfig.test.json",
          "./packages/scene-schema/tsconfig.test.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
    },
  },
  {
    files: ["**/*.config.ts", "**/*.test.{ts,tsx}", "**/setupTests.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
