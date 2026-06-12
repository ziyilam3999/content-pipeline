/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Fence jest off the emitted build output (#833): `npm run build` (tsc) emits the
  // whole tree — incl. *.test.js — into dist/, which jest would otherwise discover and
  // run as duplicate (often-failing) copies of the real TS tests. Ignore for BOTH test
  // discovery and Haste module resolution so a prior build can't pollute `npm test`.
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};
