module.exports = {
	env: {
		browser: true,
		commonjs: true,
		es2021: true
	},
	plugins: ["prettier"],
	extends: "eslint:recommended",
	overrides: [
		{
			env: {
				node: true
			},
			files: [".eslintrc.{js,cjs}"],
			parserOptions: {
				sourceType: "script"
			}
		}
	],
	parserOptions: {
		ecmaVersion: "latest"
	},
	rules: {
		"prettier/prettier": [
			"error",
			{
				useTabs: true,
				singleQuote: false,
				semi: false,
				trailingComma: "none"
			}
		],
		quotes: ["error", "double"]
	}
}
