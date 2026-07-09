// Jest stub for CSS side-effect imports (e.g. theme.ts → `import '@/global.css'`
// for NativeWind/web). jest-expo doesn't transform plain .css, so any UI test
// that reaches a themed component would otherwise SyntaxError on the `:root`
// rule. Side-effect imports become a no-op; CSS-module class lookups (none here)
// would use identity-obj-proxy instead.
module.exports = {};
