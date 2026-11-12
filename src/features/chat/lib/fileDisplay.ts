// Fájlméret megjelenítése a csatolmányoknál.
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + SIZE_UNITS[i];
}
