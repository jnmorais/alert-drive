const fullCoverage = { statements: 100, branches: 100, functions: 100, lines: 100 };

module.exports = {
  preset: 'jest-expo',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
  coverageThreshold: {
    './src/core/': fullCoverage,
  },
};
