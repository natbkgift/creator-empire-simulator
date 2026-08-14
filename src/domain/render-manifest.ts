import type { Language } from './types.js';

export interface RenderInputBinding {
  path: string;
  sha256: string;
}

export interface RenderManifestInput {
  jobId: string;
  projectId: string;
  inputRoot: string;
  language: Language;
  durationSeconds: number;
  audio: RenderInputBinding;
  captions: RenderInputBinding;
  syntheticMediaDisclosure: string;
}

export interface RenderManifest {
  schemaVersion: 1;
  jobId: string;
  projectId: string;
  language: Language;
  renderer: {
    name: 'remotion';
    compositionId: 'FlowBizVerticalShort';
    width: 1080;
    height: 1920;
    fps: 30;
    durationInFrames: number;
  };
  inputs: {
    audio: RenderInputBinding;
    captions: RenderInputBinding;
  };
  syntheticMediaDisclosure: string;
}

export type RenderManifestResult = { ok: true; manifest: RenderManifest } | { ok: false; error: string };

const digestPattern = /^[a-f0-9]{64}$/i;
const identifierPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

/** One hour at 30 fps: deliberately above short-form needs while bounding renderer work. */
export const MAX_RENDER_DURATION_IN_FRAMES = 108_000;
const RENDER_FPS = 30;

const validIdentifier = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length <= 128
  && identifierPattern.test(value)
);

const normalizeAbsolutePath = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.startsWith('/') || controlCharacterPattern.test(value) || value.includes('\\')) return undefined;
  const segments = value.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) return undefined;
  const normalizedSegments = segments.filter(Boolean);
  return normalizedSegments.length ? `/${normalizedSegments.join('/')}` : '/';
};

const validInputRoot = (value: unknown, projectId: string, jobId: string): string | undefined => {
  const root = normalizeAbsolutePath(value);
  if (!root || root === '/') return undefined;
  const segments = root.slice(1).split('/');
  return segments.at(-2) === projectId && segments.at(-1) === jobId ? root : undefined;
};

const normalizeBinding = (value: unknown, inputRoot: string): RenderInputBinding | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const binding = value as Partial<RenderInputBinding>;
  const path = normalizeAbsolutePath(binding.path);
  const digest = text(binding.sha256);
  if (!path || !digestPattern.test(digest)) return undefined;
  const separator = path.lastIndexOf('/');
  if (separator <= 0 || path.slice(0, separator) !== inputRoot) return undefined;
  return { path, sha256: digest.toLowerCase() };
};

const durationInFrames = (durationSeconds: number): number | undefined => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined;
  const rawFrames = durationSeconds * RENDER_FPS;
  if (!Number.isFinite(rawFrames)) return undefined;
  const nearestFrame = Math.round(rawFrames);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(rawFrames)) * 8;
  const frames = Math.abs(rawFrames - nearestFrame) <= tolerance ? nearestFrame : Math.ceil(rawFrames);
  return Number.isSafeInteger(frames) && frames > 0 && frames <= MAX_RENDER_DURATION_IN_FRAMES ? frames : undefined;
};

export const createRenderManifest = (input: RenderManifestInput): RenderManifestResult => {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Render manifest input is required.' };
  if (!validIdentifier(input.jobId) || !validIdentifier(input.projectId)) return { ok: false, error: 'Job and project IDs must use canonical lowercase safe identifiers.' };
  const jobId = input.jobId;
  const projectId = input.projectId;
  const inputRoot = validInputRoot(input.inputRoot, projectId, jobId);
  const disclosure = text(input.syntheticMediaDisclosure);
  if (!inputRoot) return { ok: false, error: 'Input root must be absolute and end with the exact project and job IDs.' };
  if (input.language !== 'th' && input.language !== 'en') return { ok: false, error: 'Render language must be Thai or English.' };
  const frames = durationInFrames(input.durationSeconds);
  if (!frames) return { ok: false, error: `Render duration must produce 1-${MAX_RENDER_DURATION_IN_FRAMES} safe frames.` };
  const audio = normalizeBinding(input.audio, inputRoot);
  const captions = normalizeBinding(input.captions, inputRoot);
  if (!audio || !captions) return { ok: false, error: 'Inputs require direct child paths under the declared root and SHA-256 digests.' };
  if (!disclosure) return { ok: false, error: 'Synthetic-media disclosure is required.' };

  return { ok: true, manifest: {
    schemaVersion: 1,
    jobId,
    projectId,
    language: input.language,
    renderer: {
      name: 'remotion',
      compositionId: 'FlowBizVerticalShort',
      width: 1080,
      height: 1920,
      fps: RENDER_FPS,
      durationInFrames: frames,
    },
    inputs: { audio, captions },
    syntheticMediaDisclosure: disclosure,
  } };
};
