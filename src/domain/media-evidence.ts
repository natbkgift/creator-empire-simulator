import type { MediaArtifact, MediaQaEvidence, VideoProject } from './types.js';

export interface ManualMediaEvidenceInput {
  filenames: Record<MediaArtifact['kind'], string>;
  digests: Record<MediaArtifact['kind'], string>;
  reviewer: string;
  reviewedAt: string;
  checks: MediaQaEvidence['checks'];
}

export type ManualMediaEvidenceResult = { ok: true } | { ok: false; error: string };

const artifactKinds: MediaArtifact['kind'][] = ['voice', 'captions', 'render'];
const checkKinds: (keyof MediaQaEvidence['checks'])[] = ['brand', 'duration', 'resolution', 'audio', 'captionSync', 'language'];
const digestPattern = /^[a-f0-9]{64}$/i;
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export const isValidReviewTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= lastDay && !Number.isNaN(Date.parse(value));
};

export const saveManualMediaEvidence = (
  project: VideoProject,
  input: ManualMediaEvidenceInput,
): ManualMediaEvidenceResult => {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Media evidence is required.' };
  const reviewer = text(input.reviewer);
  const reviewedAt = text(input.reviewedAt);
  if (!reviewer || !reviewedAt) return { ok: false, error: 'Reviewer and review time are required.' };
  if (!isValidReviewTimestamp(reviewedAt)) return { ok: false, error: 'Review time must be a valid ISO datetime.' };
  if (!input.filenames || !artifactKinds.every((kind) => text(input.filenames[kind]))) {
    return { ok: false, error: 'Voice, caption, and render filenames are required.' };
  }
  if (!input.digests || !artifactKinds.every((kind) => digestPattern.test(text(input.digests[kind])))) {
    return { ok: false, error: 'Every artifact requires an exact 64-character SHA-256 digest.' };
  }
  if (!input.checks || !checkKinds.every((kind) => typeof input.checks[kind] === 'boolean')) {
    return { ok: false, error: 'Every media QA check requires an explicit result.' };
  }

  const digests = Object.fromEntries(artifactKinds.map((kind) => [kind, text(input.digests[kind]).toLowerCase()])) as ManualMediaEvidenceInput['digests'];
  const artifacts = artifactKinds.map((kind): MediaArtifact => ({
    id: `media-${project.id}-${kind}-${digests[kind].slice(0, 12)}`,
    projectId: project.id,
    kind,
    filename: text(input.filenames[kind]),
    sha256: digests[kind],
    status: 'reviewed',
    language: project.language,
    source: 'manual',
    createdAt: reviewedAt,
  }));
  const allChecksPass = checkKinds.every((kind) => input.checks[kind] === true);

  project.mediaArtifacts = artifacts;
  project.mediaQa = {
    reviewer,
    reviewedAt,
    result: allChecksPass ? 'pass' : 'fail',
    artifactDigests: digests,
    checks: { ...input.checks },
  };
  project.updatedAt = reviewedAt;
  return { ok: true };
};
