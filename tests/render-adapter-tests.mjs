import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access, mkdtemp, mkdir, readFile, readdir, rm, symlink, truncate, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bundlePrivateTemplate,
  finishRenderCleanup,
  PRIVATE_RENDER_CONCURRENCY,
  PRIVATE_RENDER_DISALLOW_PARALLEL_ENCODING,
  prepareRenderJob,
  publishOutputNoClobber,
  renderPrivate,
} from '../scripts/render-private.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const fixture = async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'flowbiz-render-'));
  const inputRoot = join(temporaryRoot, 'project-g05-en', 'job-g05-en-001');
  await mkdir(inputRoot, { recursive: true });
  const audio = Buffer.from('bounded-audio-fixture');
  const captions = Buffer.from('1\n00:00:00,000 --> 00:00:01,500\nFlowBiz private render\n');
  const audioPath = join(inputRoot, 'en-US.wav');
  const captionsPath = join(inputRoot, 'en-US.srt');
  await writeFile(audioPath, audio);
  await writeFile(captionsPath, captions);
  const manifest = {
    schemaVersion: 1,
    jobId: 'job-g05-en-001',
    projectId: 'project-g05-en',
    language: 'en',
    renderer: {
      name: 'remotion', compositionId: 'FlowBizVerticalShort',
      width: 1080, height: 1920, fps: 30, durationInFrames: 45,
    },
    inputs: {
      audio: { path: audioPath, sha256: digest(audio) },
      captions: { path: captionsPath, sha256: digest(captions) },
    },
    syntheticMediaDisclosure: 'AI-generated narration and visuals.',
  };
  const manifestPath = join(inputRoot, 'render-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  return {
    temporaryRoot, inputRoot, audio, captions, audioPath, captionsPath, manifest, manifestPath,
  };
};

const cleanupFixture = async (value, prepared) => {
  await prepared?.cleanup();
  await rm(value.temporaryRoot, { recursive: true, force: true });
};

const bundledText = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? bundledText(path) : readFile(path, 'utf8');
  }));
  return values.join('\n');
};

test('private render adapter stages and parses the exact verified bytes', async () => {
  const value = await fixture();
  let prepared;
  try {
    prepared = await prepareRenderJob(value.manifestPath);
    assert.equal(prepared.manifest.jobId, value.manifest.jobId);
    assert.equal(prepared.audioPath, undefined);
    assert.equal(prepared.inputRoot, undefined);
    assert.deepEqual(prepared.captions, [{ startFrame: 0, endFrame: 45, text: 'FlowBiz private render' }]);
    await writeFile(value.audioPath, 'replacement-after-prepare');
    await writeFile(value.captionsPath, 'replacement-after-prepare');
    assert.deepEqual(await readFile(join(prepared.publicDir, prepared.audioFileName)), value.audio);
    assert.deepEqual(await readFile(join(prepared.publicDir, prepared.captionsFileName)), value.captions);
  } finally {
    await cleanupFixture(value, prepared);
  }
});

test('prepared private inputs have an explicit idempotent cleanup', async () => {
  const value = await fixture();
  let prepared;
  try {
    prepared = await prepareRenderJob(value.manifestPath);
    await prepared.cleanup();
    await prepared.cleanup();
    await assert.rejects(access(prepared.publicDir), { code: 'ENOENT' });
  } finally {
    await cleanupFixture(value, prepared);
  }
});

test('private render adapter rejects digest mismatch before rendering', async () => {
  const value = await fixture();
  try {
    value.manifest.inputs.audio.sha256 = '0'.repeat(64);
    await writeFile(value.manifestPath, `${JSON.stringify(value.manifest)}\n`);
    await assert.rejects(prepareRenderJob(value.manifestPath), /digest/i);
  } finally {
    await cleanupFixture(value);
  }
});

test('private render adapter rejects a same-root input symlink', async () => {
  const value = await fixture();
  try {
    const targetPath = join(value.inputRoot, 'real-audio.wav');
    await writeFile(targetPath, value.audio);
    await rm(value.audioPath);
    await symlink(targetPath, value.audioPath);
    await assert.rejects(prepareRenderJob(value.manifestPath), /regular|symlink|input/i);
  } finally {
    await cleanupFixture(value);
  }
});

test('private render adapter rejects a manifest symlink', async () => {
  const value = await fixture();
  try {
    const targetPath = join(value.inputRoot, 'real-render-manifest.json');
    await writeFile(targetPath, `${JSON.stringify(value.manifest)}\n`);
    await rm(value.manifestPath);
    await symlink(targetPath, value.manifestPath);
    await assert.rejects(prepareRenderJob(value.manifestPath), /regular|symlink|manifest/i);
  } finally {
    await cleanupFixture(value);
  }
});

test('private render adapter rejects an oversized manifest before parsing it', async () => {
  const value = await fixture();
  try {
    await truncate(value.manifestPath, 2 * 1024 * 1024);
    await assert.rejects(prepareRenderJob(value.manifestPath), /regular|bounded|manifest/i);
  } finally {
    await cleanupFixture(value);
  }
});

test('private render adapter rejects non-regular input without reading it', async () => {
  const value = await fixture();
  try {
    await rm(value.audioPath);
    await mkdir(value.audioPath);
    await assert.rejects(prepareRenderJob(value.manifestPath), /regular|bounded/i);
  } finally {
    await cleanupFixture(value);
  }
});

test('private render adapter rejects oversized audio before reading it', async () => {
  const value = await fixture();
  try {
    await truncate(value.audioPath, (300 * 1024 * 1024));
    await assert.rejects(prepareRenderJob(value.manifestPath), /regular|bounded/i);
  } finally {
    await cleanupFixture(value);
  }
});

test('private render template bundles the pinned vertical composition from staged inputs', async () => {
  const value = await fixture();
  const bundlePath = join(value.temporaryRoot, 'bundle');
  let prepared;
  try {
    prepared = await prepareRenderJob(value.manifestPath);
    const serveUrl = await bundlePrivateTemplate(prepared.publicDir, bundlePath);
    assert.equal(serveUrl, bundlePath);
    await access(join(bundlePath, 'index.html'));
    const source = await bundledText(bundlePath);
    assert.match(source, /#22d3ee/i, 'bundled template must contain the Owner-required cyan brand token');
    assert.match(source, /#7c3aed/i, 'bundled template must contain the Owner-required violet brand token');
    assert.match(
      source,
      /FlowBiz AI Content Operations/,
      'bundled template must contain the Owner-required public presentation title',
    );
  } finally {
    await cleanupFixture(value, prepared);
  }
});

test('atomic output publication never overwrites and always removes the temporary output', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'flowbiz-publish-'));
  const outputPath = join(temporaryRoot, 'output.mp4');
  const firstTemporary = join(temporaryRoot, '.first.tmp.mp4');
  const secondTemporary = join(temporaryRoot, '.second.tmp.mp4');
  try {
    await writeFile(firstTemporary, 'first-output');
    await publishOutputNoClobber(firstTemporary, outputPath);
    assert.equal(await readFile(outputPath, 'utf8'), 'first-output');
    await assert.rejects(access(firstTemporary), { code: 'ENOENT' });

    await writeFile(secondTemporary, 'second-output');
    await assert.rejects(publishOutputNoClobber(secondTemporary, outputPath), /exists|overwrite/i);
    assert.equal(await readFile(outputPath, 'utf8'), 'first-output');
    await assert.rejects(access(secondTemporary), { code: 'ENOENT' });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('render cleanup preserves the primary error and aggregates cleanup errors', async () => {
  const primaryError = new Error('primary operation failed');
  const cleanupError = new Error('cleanup failed');
  await assert.rejects(
    finishRenderCleanup([
      async () => { throw cleanupError; },
    ], { operationFailed: true, primaryError }),
    (error) => error instanceof AggregateError
      && error.cause === primaryError
      && error.errors[0] === primaryError
      && error.errors[1] === cleanupError,
  );
});

test('render cleanup errors fail an otherwise successful operation', async () => {
  const firstCleanupError = new Error('first cleanup failed');
  const secondCleanupError = new Error('second cleanup failed');
  await assert.rejects(
    finishRenderCleanup([
      async () => { throw firstCleanupError; },
      async () => { throw secondCleanupError; },
    ]),
    (error) => error instanceof AggregateError
      && error.errors[0] === firstCleanupError
      && error.errors[1] === secondCleanupError,
  );
});

test('private render command fails closed for non-MP4 output', async () => {
  const value = await fixture();
  try {
    await assert.rejects(renderPrivate(value.manifestPath, join(value.temporaryRoot, 'output.mov')), /MP4/i);
  } finally {
    await cleanupFixture(value);
  }
});

test('private render concurrency is fixed at one browser renderer', () => {
  assert.equal(PRIVATE_RENDER_CONCURRENCY, 1);
});

test('private render does not encode while rendering frames', () => {
  assert.equal(PRIVATE_RENDER_DISALLOW_PARALLEL_ENCODING, true);
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`\n${passed}/${tests.length} private render adapter tests passed.`);
