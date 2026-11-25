const { loadEnv } = require("@medusajs/framework/utils")
loadEnv("test", process.cwd())

module.exports = {
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      { jsc: { parser: { syntax: "typescript", decorators: true }, target: "es2021" } },
    ],
  },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  testMatch: ["**/integration-tests/http/*.spec.[jt]s"],
}
