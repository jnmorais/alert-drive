import { describe, expect, it } from '@jest/globals';

import { CSV_MIME_TYPE, exportFileName, TEXT_MIME_TYPE, UTF8_BYTE_ORDER_MARK } from './exportFiles';

describe('RF12 e RF14 - nome e tipo dos arquivos exportados', () => {
  it('usa a data e a hora local da exportação no nome', () => {
    expect(exportFileName('alert-drive-cenarios', Date.UTC(2026, 10, 10, 4, 5), -180, 'txt')).toBe(
      'alert-drive-cenarios-2026-11-10-0105.txt',
    );
    expect(exportFileName('alert-drive-cenarios', Date.UTC(2026, 10, 10, 2, 59), -180, 'csv')).toBe(
      'alert-drive-cenarios-2026-11-09-2359.csv',
    );
  });

  it('marca CSV e texto com o tipo certo e o CSV como UTF-8', () => {
    expect(CSV_MIME_TYPE).toBe('text/csv');
    expect(TEXT_MIME_TYPE).toBe('text/plain');
    expect(UTF8_BYTE_ORDER_MARK).toBe('﻿');
  });
});
