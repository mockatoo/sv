import { chromium } from '@playwright/test';
import { createSetupTest } from 'sv/testing';
import * as vitest from 'vitest';

export const setupTest = createSetupTest(vitest, { chromium });
