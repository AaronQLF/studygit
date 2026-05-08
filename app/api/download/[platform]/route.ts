import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Cache the GitHub release lookup for 10 minutes so repeated clicks don't
// burn the unauthenticated 60 req/hr GitHub rate limit per IP.
export const revalidate = 600;

// `electron-builder.yml` publishes to GitHub Releases on this repo. Override
// at build/runtime via NEXT_PUBLIC_GITHUB_REPO if the project ever moves.
const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "AaronQLF/studygit";

const PLATFORM_MATCHERS: Record<string, (asset: string) => boolean> = {
  // Apple Silicon DMG: electron-builder names this `<product>-<ver>-arm64.dmg`.
  "mac-arm64": (name) => /-arm64\.dmg$/i.test(name),
  // Intel DMG: every other `.dmg` artifact is the x64 build (no -arm64 suffix).
  "mac-x64": (name) => /\.dmg$/i.test(name) && !/-arm64\.dmg$/i.test(name),
  // Windows NSIS installer: `<product> Setup <ver>.exe`. We match any .exe
  // ending with "Setup ...exe" to be tolerant of naming tweaks.
  win: (name) => /\.exe$/i.test(name) && /setup/i.test(name),
};

type GhAsset = { name: string; browser_download_url: string };
type GhRelease = { html_url: string; assets: GhAsset[] };

export async function GET(
  _request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;
  const matcher = PLATFORM_MATCHERS[platform];
  if (!matcher) {
    return NextResponse.json(
      { error: "unknown platform", platform },
      { status: 400 }
    );
  }

  // Fall back to the releases index if we can't resolve a specific asset —
  // the user still gets somewhere useful (and sees the build is missing)
  // rather than a 500.
  const releasesIndex = `https://github.com/${REPO}/releases`;

  let release: GhRelease | null = null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        next: { revalidate: 600 },
      }
    );
    if (res.ok) {
      release = (await res.json()) as GhRelease;
    }
  } catch {
    release = null;
  }

  const asset = release?.assets.find((a) => matcher(a.name));
  const target = asset?.browser_download_url ?? release?.html_url ?? releasesIndex;
  return NextResponse.redirect(target, { status: 302 });
}
