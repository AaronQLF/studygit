// Tiny environment probe: are we running inside the Electron renderer with
// our preload bridge attached? The bridge surface is augmented in
// types/globals.d.ts as `window.studygit`. We probe for one of its methods
// because the object can appear partially populated during preload setup.

export function isElectronEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (
    window as unknown as {
      studygit?: { getWebviewPreloadUrl?: () => Promise<string> };
    }
  ).studygit;
  return !!bridge?.getWebviewPreloadUrl;
}
