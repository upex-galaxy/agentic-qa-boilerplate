import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

test('verify Node.js fs APIs work (Bun APIs not available in Playwright)', async () => {
  // This test confirms that:
  // 1. Bun global is NOT available in Playwright runtime
  // 2. Node.js fs APIs work correctly as replacement

  // Test 1: Bun is NOT defined (expected in Playwright)
  const bunExists = typeof Bun !== 'undefined';
  console.log('Bun exists:', bunExists);
  expect(bunExists).toBe(false); // Bun should NOT be available

  // Test 2: Node.js fs APIs work
  const testDir = 'test-results/.sandbox-test';
  const testFile = join(testDir, 'test.json');

  // Create directory
  mkdirSync(testDir, { recursive: true });
  expect(existsSync(testDir)).toBe(true);
  console.log('mkdirSync works');

  // Write file
  writeFileSync(testFile, JSON.stringify({ test: true }, null, 2));
  expect(existsSync(testFile)).toBe(true);
  console.log('writeFileSync works');

  // Cleanup
  rmSync(testDir, { recursive: true });
  expect(existsSync(testDir)).toBe(false);
  console.log('rmSync works');

  console.log('\nAll Node.js fs APIs work correctly in Playwright runtime');
});
