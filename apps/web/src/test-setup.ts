import { cleanup } from '@testing-library/react';
import { resetLanguage } from '@tickrs/ui';
import { afterEach } from 'vitest';

afterEach(async () => {
  cleanup();
  await resetLanguage();
});
