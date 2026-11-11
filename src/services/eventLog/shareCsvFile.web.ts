const RELEASE_DELAY = 1000;

export async function shareTextFile(fileName: string, content: string, mimeType: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), RELEASE_DELAY);
}

export function shareCsvFile(fileName: string, content: string): Promise<void> {
  return shareTextFile(fileName, content, 'text/csv');
}
