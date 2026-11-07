// Local Noto Sans for texts: troika tries its default font (`latin`), then the Text's own `font`
// (`latin-ext`, Polish letters). Only characters neither file has go to troika's CDN fallback.
import { configureTextBuilder } from 'troika-three-text';
import latinUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import latinExtUrl from '@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url';

configureTextBuilder({ defaultFontURL: latinUrl });
export const FONT_URL = latinExtUrl;
