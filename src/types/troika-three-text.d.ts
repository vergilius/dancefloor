// troika-three-text has no `types` field in package.json; we only call this.
declare module 'troika-three-text' {
  export function configureTextBuilder(config: { defaultFontURL?: string }): void;
}
