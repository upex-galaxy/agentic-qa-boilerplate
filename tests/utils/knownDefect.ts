import { test } from '@playwright/test';
import { tag } from 'allure-js-commons/sync';

export function knownDefect(defectKey: string, reason?: string): void {
  test.info().annotations.push({ type: 'known-defect', description: defectKey });
  // allure-playwright drops an annotation pushed while a test runs, so the key also travels as a tag.
  try {
    tag(`blocked:${defectKey}`);
  }
  catch {
    // A reporter without the synchronous Allure API must not stop the expected failure from being declared
  }
  test.fail(true, reason === undefined ? `Blocked by ${defectKey}` : `Blocked by ${defectKey}: ${reason}`);
}
