// Polish UI strings (PLAN.md §2). Keep all user-visible text here.
export const t = {
  appTitle: 'DanceFloor',
  loading: 'Wczytywanie…',
  noProject: 'Nie otwarto folderu projektu.',
  folderOpen: 'Otwórz folder projektu',
  folderChange: 'Zmień folder',
  folderRemembered: 'Ostatni folder:',
  folderRestore: 'Przywróć dostęp',
  folderEmpty: 'Brak plików DWG ani PDF w tym folderze.',
  parsing: 'Parsowanie…',
  entities: 'Obiekty',
  layers: 'Warstwy',
  notMm: 'oczekiwano 4 = mm',
  folderUnsupported:
    'Ta przeglądarka nie obsługuje dostępu do folderów (File System Access API). Użyj Chrome lub Edge.',
  fileCount: (n: number) => `${n} ${n === 1 ? 'plik' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'pliki' : 'plików'}`,
} as const;
