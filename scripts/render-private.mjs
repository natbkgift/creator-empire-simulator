#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import {
  link, mkdir, mkdtemp, open, realpath, rm, stat, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const digestPattern = /^[a-f0-9]{64}$/i;
const identifierPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const MAX_AUDIO_BYTES = 256 * 1024 * 1024;
const MAX_CAPTION_BYTES = 2 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
export const PRIVATE_RENDER_CONCURRENCY = 1;

const hashFile = async (path) => new Promise((resolveHash, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolveHash(hash.digest('hex')));
});

const timestampFrames = (value, fps) => {
  const match = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
  if (!match) throw new Error(`Invalid SRT timestamp: ${value}`);
  const [, hours, minutes, seconds, milliseconds] = match.map(Number);
  if (minutes > 59 || seconds > 59) throw new Error(`Invalid SRT timestamp: ${value}`);
  return ((hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000)) * fps;
};

export const parseSrt = (source, fps, durationInFrames) => source
  .replaceAll('\r\n', '\n')
  .trim()
  .split(/\n{2,}/)
  .filter(Boolean)
  .map((block) => {
    const lines = block.split('\n');
    if (/^\d+$/.test(lines[0] ?? '')) lines.shift();
    const timing = lines.shift() ?? '';
    const match = /^(\S+)\s+-->\s+(\S+)$/.exec(timing);
    if (!match) throw new Error('Invalid SRT cue timing.');
    const startFrame = Math.max(0, Math.floor(timestampFrames(match[1], fps)));
    const endFrame = Math.min(durationInFrames, Math.ceil(timestampFrames(match[2], fps)));
    const text = lines.join('\n').trim();
    if (!text || endFrame <= startFrame) throw new Error('Invalid or empty SRT cue.');
    return { startFrame, endFrame, text };
  });

const validateManifest = (manifest) => {
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== 1) throw new Error('Unsupported render manifest.');
  if (!identifierPattern.test(manifest.jobId ?? '') || !identifierPattern.test(manifest.projectId ?? '')) throw new Error('Invalid render identity.');
  const renderer = manifest.renderer;
  if (!renderer || renderer.name !== 'remotion' || renderer.compositionId !== 'FlowBizVerticalShort') throw new Error('Unsupported renderer contract.');
  if (renderer.width !== 1080 || renderer.height !== 1920 || renderer.fps !== 30 || !Number.isSafeInteger(renderer.durationInFrames) || renderer.durationInFrames <= 0 || renderer.durationInFrames > 108000) throw new Error('Invalid renderer dimensions or duration.');
  if (!['th', 'en'].includes(manifest.language) || typeof manifest.syntheticMediaDisclosure !== 'string' || !manifest.syntheticMediaDisclosure.trim()) throw new Error('Invalid language or disclosure.');
  for (const kind of ['audio', 'captions']) {
    const binding = manifest.inputs?.[kind];
    if (!binding || typeof binding.path !== 'string' || !digestPattern.test(binding.sha256 ?? '')) throw new Error(`Invalid ${kind} binding.`);
  }
};

const directChildPath = (path, root) => {
  const lexical = resolve(path);
  if (dirname(lexical) !== root) throw new Error('Input containment check failed.');
  return lexical;
};

const readBoundedRegularFile = async (path, maximumBytes, kind) => {
  const noFollow = fsConstants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow) || noFollow === 0) {
    throw new Error('Secure no-follow file reads are unsupported on this platform.');
  }
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | noFollow);
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error(`${kind} input must not be a symlink.`, { cause: error });
    throw error;
  }

  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > maximumBytes) {
      throw new Error(`${kind} input must be a regular bounded file.`);
    }
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, maximumBytes + 1 - totalBytes));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > maximumBytes) throw new Error(`${kind} input must be a regular bounded file.`);
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    await handle.close();
  }
};

export const finishRenderCleanup = async (
  cleanupTasks,
  { operationFailed = false, primaryError } = {},
) => {
  const results = await Promise.allSettled(
    cleanupTasks.filter(Boolean).map((cleanup) => Promise.resolve().then(cleanup)),
  );
  const cleanupErrors = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
  if (operationFailed && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      'Private render failed and cleanup also failed.',
      { cause: primaryError },
    );
  }
  if (operationFailed) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Private render cleanup failed.');
  }
};

const verifiedInput = async (path, root, expectedDigest, maximumBytes, kind) => {
  const lexicalPath = directChildPath(path, root);
  const bytes = await readBoundedRegularFile(lexicalPath, maximumBytes, kind);
  const actualDigest = createHash('sha256').update(bytes).digest('hex');
  if (actualDigest !== expectedDigest.toLowerCase()) throw new Error(`${kind} digest mismatch.`);
  return { bytes, extension: extname(lexicalPath) };
};

export const prepareRenderJob = async (manifestPath) => {
  const lexicalManifestPath = resolve(manifestPath);
  const sourceRoot = await realpath(dirname(lexicalManifestPath));
  const resolvedManifestPath = join(sourceRoot, basename(lexicalManifestPath));
  const rootSegments = sourceRoot.split(sep).filter(Boolean);
  const manifestBytes = await readBoundedRegularFile(resolvedManifestPath, MAX_MANIFEST_BYTES, 'Manifest');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  validateManifest(manifest);
  if (rootSegments.at(-2) !== manifest.projectId || rootSegments.at(-1) !== manifest.jobId) throw new Error('Manifest job/project containment check failed.');

  const audio = await verifiedInput(manifest.inputs.audio.path, sourceRoot, manifest.inputs.audio.sha256, MAX_AUDIO_BYTES, 'Audio');
  const captionsInput = await verifiedInput(manifest.inputs.captions.path, sourceRoot, manifest.inputs.captions.sha256, MAX_CAPTION_BYTES, 'Caption');
  const captions = parseSrt(captionsInput.bytes.toString('utf8'), manifest.renderer.fps, manifest.renderer.durationInFrames);
  const publicDir = await mkdtemp(join(tmpdir(), 'flowbiz-remotion-inputs-'));
  const audioFileName = `audio${audio.extension || '.bin'}`;
  const captionsFileName = 'captions.srt';
  try {
    await writeFile(join(publicDir, audioFileName), audio.bytes, { mode: 0o600 });
    await writeFile(join(publicDir, captionsFileName), captionsInput.bytes, { mode: 0o600 });
  } catch (error) {
    await finishRenderCleanup([
      () => rm(publicDir, { recursive: true, force: true }),
    ], { operationFailed: true, primaryError: error });
  }

  return {
    manifest,
    publicDir,
    audioFileName,
    captionsFileName,
    captions,
    cleanup: () => rm(publicDir, { recursive: true, force: true }),
  };
};

const templateEntryPoint = fileURLToPath(new URL('../render/index.tsx', import.meta.url));

export const bundlePrivateTemplate = async (publicDir, outDir) => bundle({
  entryPoint: templateEntryPoint,
  outDir,
  publicDir,
  onProgress: () => undefined,
});

export const publishOutputNoClobber = async (temporaryOutput, outputPath) => {
  let operationFailed = false;
  let primaryError;
  try {
    await link(temporaryOutput, outputPath);
  } catch (error) {
    operationFailed = true;
    primaryError = error?.code === 'EEXIST'
      ? new Error('Private render output already exists; refusing to overwrite it.', { cause: error })
      : error;
  }
  await finishRenderCleanup([
    () => rm(temporaryOutput, { force: true }),
  ], { operationFailed, primaryError });
};

export const renderPrivate = async (manifestPath, outputPath) => {
  const resolvedOutput = resolve(outputPath ?? '');
  if (extname(resolvedOutput).toLowerCase() !== '.mp4') throw new Error('Private render output must be an MP4 file.');

  await mkdir(dirname(resolvedOutput), { recursive: true });
  let prepared;
  let temporaryDirectory;
  let temporaryOutputDirectory;
  let operationFailed = false;
  let primaryError;
  let result;
  try {
    prepared = await prepareRenderJob(manifestPath);
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'flowbiz-remotion-bundle-'));
    temporaryOutputDirectory = await mkdtemp(join(dirname(resolvedOutput), '.flowbiz-remotion-output-'));
    const temporaryOutput = join(temporaryOutputDirectory, `${randomUUID()}.mp4`);
    const inputProps = {
      audioFileName: prepared.audioFileName,
      captions: prepared.captions,
      disclosure: prepared.manifest.syntheticMediaDisclosure.trim(),
      durationInFrames: prepared.manifest.renderer.durationInFrames,
      language: prepared.manifest.language,
      projectId: prepared.manifest.projectId,
    };
    const serveUrl = await bundlePrivateTemplate(prepared.publicDir, join(temporaryDirectory, 'bundle'));
    const composition = await selectComposition({
      serveUrl,
      id: prepared.manifest.renderer.compositionId,
      inputProps,
      logLevel: 'warn',
    });
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      concurrency: PRIVATE_RENDER_CONCURRENCY,
      outputLocation: temporaryOutput,
      inputProps,
      logLevel: 'warn',
    });
    const outputStat = await stat(temporaryOutput);
    if (!outputStat.isFile()) throw new Error('Renderer did not produce a regular MP4 output.');
    result = {
      outputPath: resolvedOutput,
      bytes: outputStat.size,
      sha256: await hashFile(temporaryOutput),
      manifestJobId: prepared.manifest.jobId,
      manifestProjectId: prepared.manifest.projectId,
    };
    await publishOutputNoClobber(temporaryOutput, resolvedOutput);
  } catch (error) {
    operationFailed = true;
    primaryError = error;
  }
  await finishRenderCleanup([
    prepared && (() => prepared.cleanup()),
    temporaryDirectory && (() => rm(temporaryDirectory, { recursive: true, force: true })),
    temporaryOutputDirectory && (() => rm(temporaryOutputDirectory, { recursive: true, force: true })),
  ], { operationFailed, primaryError });
  return result;
};

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const [, , manifestPath, outputPath] = process.argv;
  if (!manifestPath || !outputPath) {
    console.error('Usage: node scripts/render-private.mjs <manifest.json> <output.mp4>');
    process.exitCode = 2;
  } else {
    renderPrivate(manifestPath, outputPath)
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}
