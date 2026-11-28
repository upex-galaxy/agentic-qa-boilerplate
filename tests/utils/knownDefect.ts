import { test } from '@playwright/test';
import { tag } from 'allure-js-commons/sync';

export function knownDefect(defectKey: string, reason?: string): void {
  test.info().annotations.push({ type: 'known-defect', description: defectKey });
  // allure-playwright drops an annotation pushed at run time, so the key also travels as a tag.
  tag(`blocked:${defectKey}`);
  test.fail(true, reason === undefined ? `Blocked by ${defectKey}` : `Blocked by ${defectKey}: ${reason}`);
}
