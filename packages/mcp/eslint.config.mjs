import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["src/database.types.ts"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
