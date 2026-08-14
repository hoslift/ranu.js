/** @type {import("prettier").Config} */
const config = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: "as-needed",
  trailingComma: "all",
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  endOfLine: "lf",
  overrides: [
    {
      files: ["*.json", "*.yaml", "*.yml"],
      options: {
        tabWidth: 2,
      },
    },
    {
      files: ["*.md"],
      options: {
        printWidth: 120,
        proseWrap: "preserve",
      },
    },
  ],
};

export default config;
