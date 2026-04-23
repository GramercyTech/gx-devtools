/**
 * ESLint flat config (ESLint v10+) for GxP plugin projects.
 * Mirrors the toolkit's own config: JS + Vue + TS.
 * Extend or override in your own project as needed.
 */

import js from "@eslint/js"
import vue from "eslint-plugin-vue"
import globals from "globals"

export default [
	js.configs.recommended,
	...vue.configs["flat/recommended"],
	{
		ignores: ["dist/**", "node_modules/**", "coverage/**", ".certs/**"],
	},
	{
		files: ["**/*.{js,mjs,cjs,vue}"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			"no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
			"vue/multi-word-component-names": "off",
		},
	},
]
