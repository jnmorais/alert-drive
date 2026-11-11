import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

export async function shareTextFile(fileName: string, content: string, mimeType: string): Promise<void> {
  if (!(await isAvailableAsync())) {
    throw new Error('Compartilhamento indisponível neste aparelho');
  }
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(content);
  await shareAsync(file.uri, { mimeType, dialogTitle: 'Exportar do Alert-Drive' });
}

export function shareCsvFile(fileName: string, content: string): Promise<void> {
  return shareTextFile(fileName, content, 'text/csv');
}
