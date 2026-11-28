import { describe, expect, test } from 'bun:test';

import { eddSignersArgs } from './install.ts';

describe('the installer seeds the evidence signer with the user key', () => {
  test('a copied template replaces the maintainers\' signer, any other project only fills a missing one', () => {
    expect(eddSignersArgs(true)).toEqual(['scripts/edd.ts', 'signers', '--replace']);
    expect(eddSignersArgs(false)).toEqual(['scripts/edd.ts', 'signers']);
  });
});
