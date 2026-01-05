import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";

export default [
  js.configs.recommended,

  // Backend JS
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 },
      ecmaVersion: "latest",
      sourceType: "commonjs",
    },
    plugins: { import: importPlugin },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // Frontend TS/TSX (no tsconfig needed)
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      globals: { ...globals.browser, ...globals.es2021 },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: { "@typescript-eslint": tsPlugin, import: importPlugin },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  { ignores: ["**/dist/**", "**/build/**", "**/node_modules/**"] },
];
