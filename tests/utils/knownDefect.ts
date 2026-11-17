import { test } from '@playwright/test';

export function knownDefect(defectKey: string, reason?: string): void {
  test.info().annotations.push({ type: 'known-defect', description: defectKey });
  test.fail(true, reason === undefined ? `Blocked by ${defectKey}` : `Blocked by ${defectKey}: ${reason}`);
}
