import { flushStore, hydrateWorkspace } from '../app/store.js';
import type { AutopilotJob, AutopilotPackage, Workspace } from '../domain/types.js';
import { escapeHtml } from '../domain/utils.js';
import { showToast } from '../ui/feedback.js';
import { simpleChannelRecommendations } from '../domain/simple-channels.js';
import { clearPendingRequest, clearRequestKey, getOrCreateRequestKey, loadPendingRequest, peekRequestKey, requestFingerprint, savePendingRequest, type RequestKeyStorage } from '../domain/request-idempotency.js';

let activeJob: AutopilotJob | null = null;
let pollTimer = 0;

const requestKeyStorage = (): RequestKeyStorage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};

class RequestError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}

const isDefinitiveRejection = (error: unknown): boolean => error instanceof RequestError
  && error.statusCode >= 400 && error.statusCode < 500 && ![408, 409, 425, 429].includes(error.statusCode);

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...init, headers: { ...(init?.body instanceof Blob ? {} : { 'content-type': 'application/json' }), ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new RequestError(response.status, body.error || `${response.status} ${response.statusText}`);
  }
  return await response.json() as T;
};

const currentJobId = (): string => {
  try { return sessionStorage.getItem('creator-autopilot-job') ?? ''; } catch { return ''; }
};

const rememberJob = (jobId: string): void => {
  try { sessionStorage.setItem('creator-autopilot-job', jobId); } catch { /* storage is optional */ }
};

const stageLabels: Record<string, string> = {
  research: 'Research', 'content-plan': 'Content Plan', script: 'Script', 'fact-check': 'Fact-check', 'production-pack': 'Production Pack', ready: 'พร้อมตรวจ',
};

const safeUrl = (value: string): string => /^https:\/\//i.test(value) ? escapeHtml(value) : '#';

const progressMarkup = (job: AutopilotJob): string => `<div class="autopilot-progress-card">
  <div class="autopilot-progress-head"><div><span>AUTOPILOT กำลังทำงาน</span><h2>${escapeHtml(stageLabels[job.stage] ?? job.stage)}</h2></div><b>${job.progress}%</b></div>
  <div class="autopilot-progress-track"><span style="width:${Math.max(2, Math.min(100, job.progress))}%"></span></div>
  <ol class="autopilot-step-list">${job.steps.map((step) => `<li class="${escapeHtml(step.status)}"><span>${step.index + 1}</span><div><b>${escapeHtml(stageLabels[step.kind] ?? step.kind)}</b><small>${step.modelTier === 'terra' ? 'Terra · วิเคราะห์สำคัญ' : 'Luna · งานสร้างสรรค์'}</small></div><em>${step.status === 'completed' ? 'เสร็จแล้ว' : step.status === 'running' ? 'กำลังทำ' : step.status === 'failed' ? 'ต้องตรวจ' : 'รอคิว'}</em></li>`).join('')}</ol>
  <p>คุณปิดแท็บได้ งานนี้ทำต่อบนเซิร์ฟเวอร์และกลับมาดูได้ภายหลัง</p>
  <button class="simple-secondary" type="button" data-simple-action="cancel-job">ยกเลิกงาน</button>
</div>`;

const reviewMarkup = (job: AutopilotJob, pack: AutopilotPackage): string => `<div class="autopilot-review-card">
  <header><div><span>พร้อมตรวจครั้งเดียว</span><h2>${escapeHtml(pack.contentPlan.title)}</h2><p>${escapeHtml(pack.contentPlan.hook)}</p></div><div class="model-ratio"><b>${pack.modelUsage.lunaPercent}%</b><span>Luna</span><b>${pack.modelUsage.terraPercent}%</b><span>Terra</span></div></header>
  <div class="review-grid">
    <section><span>สคริปต์</span><p class="review-script">${escapeHtml(pack.script.narration)}</p></section>
    <section><span>Fact-check</span><p>${escapeHtml(pack.script.factCheckSummary || 'ไม่พบประเด็นที่ต้องหยุดงาน')}</p>${pack.research.risks.map((risk) => `<small class="review-risk">${escapeHtml(risk)}</small>`).join('')}</section>
    <section><span>Storyboard</span><ol>${pack.handoff.storyboard.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol></section>
    <section><span>Metadata</span><h3>${escapeHtml(pack.metadata.title)}</h3><p>${escapeHtml(pack.metadata.description)}</p><div class="review-tags">${pack.metadata.tags.map((tag) => `<b>${escapeHtml(tag)}</b>`).join('')}</div></section>
    <section class="review-sources"><span>แหล่งข้อมูล</span>${pack.research.sources.map((source) => `<a href="${safeUrl(source.url)}" target="_blank" rel="noreferrer"><b>${escapeHtml(source.title)}</b><small>${escapeHtml(source.publisher)}</small></a>`).join('') || '<p>ไม่มีแหล่งข้อมูลที่บันทึกไว้</p>'}</section>
    <section><span>Synthetic media</span><p>${escapeHtml(pack.metadata.syntheticMediaDisclosure)}</p></section>
  </div>
  <footer><span>ตรวจครบแล้วจึงส่งต่อไป CapCut, Canva และ YouTube</span><button class="simple-primary" type="button" data-simple-action="approve-job">อนุมัติชุดวิดีโอ</button></footer>
</div>`;

const handoffMarkup = (job: AutopilotJob, pack: AutopilotPackage): string => `<div class="handoff-card">
  <header><span>ชุดวิดีโอพร้อมทำงานต่อ</span><h2>${escapeHtml(pack.contentPlan.title)}</h2><p>ดาวน์โหลดไฟล์งานหรือเปิดเครื่องมือที่ต้องการได้ทันที</p></header>
  <div class="handoff-actions">
    <a class="simple-primary" href="/api/autopilot/jobs/${encodeURIComponent(job.id)}/package.zip">ดาวน์โหลด Production Pack</a>
    <a class="simple-secondary" href="https://www.capcut.com/editor" target="_blank" rel="noreferrer">เปิด CapCut</a>
    <a class="simple-secondary" href="https://www.canva.com/create/youtube-videos/" target="_blank" rel="noreferrer">เปิด Canva</a>
  </div>
  <section class="youtube-handoff"><div><span>YOUTUBE PRIVATE UPLOAD</span><h3>อัปโหลดไฟล์ MP4 หลังตัดต่อเสร็จ</h3><p>ระบบตั้งเป็น Private เสมอ คุณเป็นผู้ตรวจและเผยแพร่จาก YouTube Studio</p></div><div id="youtube-state"><span>กำลังตรวจการเชื่อมต่อ…</span></div></section>
</div>`;

const errorMarkup = (job: AutopilotJob): string => `<div class="autopilot-error-card"><span>งานหยุดที่ ${escapeHtml(stageLabels[job.stage] ?? job.stage)}</span><h2>ต้องแก้ก่อนทำงานต่อ</h2><p>${escapeHtml(job.error || 'ไม่สามารถทำขั้นตอนนี้ให้เสร็จได้')}</p><button class="simple-primary" type="button" data-simple-action="retry-job">ลองต่อจากขั้นตอนนี้</button></div>`;

const renderJobState = (job: AutopilotJob): void => {
  const target = document.querySelector<HTMLElement>('#autopilot-state');
  if (!target) return;
  activeJob = job;
  target.innerHTML = job.status === 'queued' || job.status === 'running'
    ? progressMarkup(job)
    : job.status === 'review_ready' && job.package
      ? reviewMarkup(job, job.package)
      : job.status === 'approved' && job.package
        ? handoffMarkup(job, job.package)
        : errorMarkup(job);
  target.classList.add('visible');
  if (job.status === 'approved') void refreshYoutubeStatus();
};

const schedulePoll = (): void => {
  window.clearTimeout(pollTimer);
  if (!activeJob || !['queued', 'running'].includes(activeJob.status)) return;
  pollTimer = window.setTimeout(async () => {
    try {
      const payload = await fetchJson<{ job: AutopilotJob }>(`/api/autopilot/jobs/${encodeURIComponent(activeJob?.id ?? '')}`);
      renderJobState(payload.job); schedulePoll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ติดตามงานไม่สำเร็จ', 'warning'); schedulePoll();
    }
  }, 2200);
};

const approveJob = async (): Promise<void> => {
  if (!activeJob?.package) return;
  await flushStore();
  const payload = await fetchJson<{ job: AutopilotJob; workspace: Workspace }>(`/api/autopilot/jobs/${encodeURIComponent(activeJob.id)}/approve`, { method: 'POST', body: '{}' });
  hydrateWorkspace(payload.workspace);
  renderJobState(payload.job);
  showToast('อนุมัติและบันทึกชุดวิดีโอแล้ว', 'success');
};

const refreshYoutubeStatus = async (): Promise<void> => {
  const target = document.querySelector<HTMLElement>('#youtube-state');
  if (!target) return;
  try {
    const jobId = activeJob?.id ?? '';
    const status = await fetchJson<{ configured: boolean; connected: boolean; latestUpload?: { id: string; status: string; progress: number; videoId?: string; videoUrl?: string; error?: string } }>(`/api/youtube/status?jobId=${encodeURIComponent(jobId)}`);
    if (!status.configured) {
      target.innerHTML = '<p class="youtube-blocked">ยังไม่ได้ตั้งค่า Google OAuth Web Client บนเซิร์ฟเวอร์</p>';
      return;
    }
    if (!status.connected) {
      target.innerHTML = '<button class="simple-secondary" type="button" data-simple-action="connect-youtube">เชื่อมต่อ YouTube</button>';
      return;
    }
    const latest = status.latestUpload;
    if (latest?.status === 'uploading' || latest?.status === 'queued') {
      target.innerHTML = `<p>กำลังอัปโหลดแบบ Private · ${latest.progress}%</p>`;
      window.setTimeout(() => void refreshYoutubeStatus(), 2500); return;
    }
    if (latest?.status === 'uploaded' && latest.videoUrl) {
      const destination = latest.videoId ? `https://studio.youtube.com/video/${encodeURIComponent(latest.videoId)}/edit` : safeUrl(latest.videoUrl);
      const label = latest.videoId ? 'เปิดใน YouTube Studio' : 'เปิดวิดีโอบน YouTube';
      target.innerHTML = `<p class="youtube-success">อัปโหลด Private สำเร็จ</p><a class="simple-secondary" href="${destination}" target="_blank" rel="noreferrer">${label}</a>`; return;
    }
    if (latest?.status === 'needs_attention') {
      target.innerHTML = `<p class="youtube-blocked">${escapeHtml(latest.error || 'อัปโหลดไม่สำเร็จ')}</p><button class="simple-secondary" type="button" data-simple-action="retry-youtube" data-upload-id="${escapeHtml(latest.id)}">ลองอัปโหลดต่อ</button>`; return;
    }
    target.innerHTML = '<label class="video-file-picker"><span>เลือก MP4 จาก CapCut หรือ Canva</span><input id="youtube-video-file" type="file" accept="video/mp4,.mp4"></label><button class="simple-primary" type="button" data-simple-action="upload-youtube">อัปโหลดเป็น Private</button>';
  } catch (error) {
    target.textContent = error instanceof Error ? error.message : 'ตรวจ YouTube ไม่สำเร็จ';
  }
};

const uploadYoutube = async (): Promise<void> => {
  const file = document.querySelector<HTMLInputElement>('#youtube-video-file')?.files?.[0];
  if (!activeJob?.package) return;
  const requestScope = `youtube-upload:${activeJob.id}`;
  const storage = requestKeyStorage();
  const idempotencyKey = getOrCreateRequestKey(storage, requestScope);
  const pending = loadPendingRequest<{ assetId: string; jobId: string }>(storage, requestScope);
  let assetId = pending?.jobId === activeJob.id ? pending.assetId : '';
  if (!assetId && !file) { showToast('เลือกไฟล์ MP4 ก่อน', 'warning'); return; }
  const target = document.querySelector<HTMLElement>('#youtube-state');
  if (!assetId && file) {
    if (target) target.innerHTML = '<p>กำลังส่งไฟล์ไปยังเซิร์ฟเวอร์อย่างปลอดภัย…</p>';
    const assetResponse = await fetch('/api/video-assets', { method: 'POST', headers: { 'content-type': 'video/mp4', 'x-filename': encodeURIComponent(file.name), 'x-project-id': activeJob.id }, body: file });
    if (!assetResponse.ok) throw new Error((await assetResponse.json().catch(() => ({})) as { error?: string }).error || 'อัปโหลดไฟล์ชั่วคราวไม่สำเร็จ');
    const asset = await assetResponse.json() as { asset: { id: string } };
    assetId = asset.asset.id;
    savePendingRequest(storage, requestScope, { assetId, jobId: activeJob.id });
  }
  try {
    await fetchJson('/api/youtube/uploads', { method: 'POST', body: JSON.stringify({ idempotencyKey, assetId, jobId: activeJob.id, metadata: { ...activeJob.package.metadata, containsSyntheticMedia: true } }) });
  } catch (error) {
    if (isDefinitiveRejection(error)) {
      clearPendingRequest(storage, requestScope);
      clearRequestKey(storage, requestScope);
    }
    throw error;
  }
  clearPendingRequest(storage, requestScope);
  clearRequestKey(storage, requestScope);
  await refreshYoutubeStatus();
};

const submitAutopilot = async (form: HTMLFormElement): Promise<void> => {
  const data = new FormData(form);
  const selected = simpleChannelRecommendations.find((item) => item.key === data.get('channelKey')) ?? simpleChannelRecommendations[0];
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) { button.disabled = true; button.innerHTML = '<span>กำลังเข้าคิว…</span>'; }
  try {
    // Autopilot executes in a background worker, so persist schema-v5 AI rates and
    // budget settings before it reads the server-side workspace snapshot.
    await flushStore();
    const storage = requestKeyStorage();
    const channel = { key: selected.key, name: selected.name, niche: selected.niche, promise: selected.promise, aiFitScore: selected.aiFitScore };
    const request = { topic: data.get('topic'), format: data.get('format'), durationSeconds: Number(data.get('durationSeconds')), language: data.get('language'), channel };
    const requestScope = `autopilot-create:${requestFingerprint(request)}`;
    const idempotencyKey = getOrCreateRequestKey(storage, requestScope);
    savePendingRequest(storage, requestScope, request);
    let payload: { job: AutopilotJob };
    try {
      payload = await fetchJson<{ job: AutopilotJob }>('/api/autopilot/jobs', {
        method: 'POST', body: JSON.stringify({ idempotencyKey, ...request }),
      });
    } catch (error) {
      if (isDefinitiveRejection(error)) {
        clearPendingRequest(storage, requestScope);
        clearRequestKey(storage, requestScope);
      }
      throw error;
    }
    clearPendingRequest(storage, requestScope);
    clearRequestKey(storage, requestScope);
    rememberJob(payload.job.id); renderJobState(payload.job); schedulePoll();
    document.querySelector('#autopilot-state')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'สร้างงานไม่สำเร็จ', 'danger');
  } finally {
    if (button) { button.disabled = false; button.innerHTML = '<span>สร้างชุดวิดีโอทั้งหมด</span>'; }
  }
};

const loadExistingJob = async (): Promise<void> => {
  try {
    const saved = currentJobId();
    const payload = saved
      ? await fetchJson<{ job: AutopilotJob }>(`/api/autopilot/jobs/${encodeURIComponent(saved)}`)
      : await fetchJson<{ jobs: AutopilotJob[] }>('/api/autopilot/jobs?limit=1').then((result) => ({ job: result.jobs[0] }));
    if (payload.job) {
      const storage = requestKeyStorage();
      const requestScope = `autopilot-create:${requestFingerprint(payload.job.request)}`;
      const pendingKey = peekRequestKey(storage, requestScope);
      if (pendingKey && payload.job.idempotencyKey === pendingKey) {
        clearPendingRequest(storage, requestScope);
        clearRequestKey(storage, requestScope);
      }
      rememberJob(payload.job.id); renderJobState(payload.job); schedulePoll();
    }
  } catch { /* an empty or expired job list is a normal first-run state */ }
};

export const mountSimpleCreate = (): void => {
  const form = document.querySelector<HTMLFormElement>('[data-simple-create]');
  form?.addEventListener('submit', (event) => { event.preventDefault(); void submitAutopilot(event.currentTarget as HTMLFormElement); });
  document.querySelectorAll<HTMLInputElement>('input[name="channelKey"]').forEach((input) => input.addEventListener('change', () => {
    document.querySelectorAll('.channel-choice').forEach((choice) => choice.classList.toggle('selected', (choice.querySelector('input') as HTMLInputElement)?.checked ?? false));
  }));
  document.querySelector('#autopilot-state')?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-simple-action]');
    if (!target) return;
    const run = async (): Promise<void> => {
      if (target.dataset.simpleAction === 'approve-job') await approveJob();
      else if (target.dataset.simpleAction === 'cancel-job' && activeJob) renderJobState((await fetchJson<{ job: AutopilotJob }>(`/api/autopilot/jobs/${encodeURIComponent(activeJob.id)}/cancel`, { method: 'POST', body: '{}' })).job);
      else if (target.dataset.simpleAction === 'retry-job' && activeJob) { const payload = await fetchJson<{ job: AutopilotJob }>(`/api/autopilot/jobs/${encodeURIComponent(activeJob.id)}/retry`, { method: 'POST', body: '{}' }); renderJobState(payload.job); schedulePoll(); }
      else if (target.dataset.simpleAction === 'connect-youtube') location.href = `/api/youtube/oauth/start?returnTo=${encodeURIComponent('/#/beta/create')}`;
      else if (target.dataset.simpleAction === 'upload-youtube') await uploadYoutube();
      else if (target.dataset.simpleAction === 'retry-youtube' && target.dataset.uploadId) { await fetchJson(`/api/youtube/uploads/${encodeURIComponent(target.dataset.uploadId)}/retry`, { method: 'POST', body: '{}' }); await refreshYoutubeStatus(); }
    };
    void run().catch((error) => showToast(error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ', 'danger'));
  });
  void loadExistingJob();
};
