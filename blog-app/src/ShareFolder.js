import React, { useEffect, useRef, useState } from 'react';

const h = React.createElement;
const API_BASE = 'https://br-silent-frost-b3chnc64-aposhare.compute.c-4.ap-southeast-1.aws.neon.tech/';
const MAX_BYTES = 1024 * 1024 * 1024;
const PART_BYTES = 8 * 1024 * 1024;
const RESUME_KEY = 'apokolips-share-upload-v1';

function sizeLabel(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return (bytes / (1024 ** i)).toFixed(i ? 1 : 0) + ' ' + units[i];
}
function countdown(value, now) {
  const seconds = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}
async function readJson(response) {
  return response.json().catch(() => ({}));
}
async function postJson(path, body) {
  const response = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data.error || 'The share service could not complete this request.');
  return data;
}
function readResume() {
  try {
    const value = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null');
    return value && typeof value.token === 'string' ? value : null;
  } catch {
    return null;
  }
}
function saveResume(value) {
  try {
    if (value) sessionStorage.setItem(RESUME_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // The upload still works when browser session storage is unavailable.
  }
}
function sameFile(resume, file) {
  return Boolean(resume && file && resume.name === file.name && resume.size === file.size && resume.lastModified === file.lastModified);
}

export default function ShareFolder() {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Enter the password to open the temporary file area.');
  const [now, setNow] = useState(Date.now());
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInput = useRef(null);

  async function refresh(pass = password) {
    const data = await postJson('api/files', { password: pass });
    setFiles(Array.isArray(data.files) ? data.files : []);
  }

  async function unlock(event) {
    event.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    setStatus('Verifying password...');
    try {
      await refresh(password);
      setUnlocked(true);
      setStatus('Unlocked. Uploads and downloads are password-protected.');
    } catch (error) {
      setPassword('');
      setStatus(error.message || 'Access denied.');
    } finally {
      setBusy(false);
    }
  }

  function lock() {
    setUnlocked(false);
    setPassword('');
    setFiles([]);
    setSelected(null);
    setUploadProgress(null);
    if (fileInput.current) fileInput.current.value = '';
    setStatus('Folder locked. Enter the password to continue.');
  }

  async function upload(event) {
    event.preventDefault();
    if (!selected) return;
    if (selected.size > MAX_BYTES) {
      setStatus('The maximum file size is 1 GB (1024 MB).');
      return;
    }
    if (selected.size <= 0) {
      setStatus('Empty files cannot be uploaded.');
      return;
    }

    setBusy(true);
    setUploadProgress(0);
    let token = '';
    try {
      let resume = readResume();
      if (sameFile(resume, selected)) {
        token = resume.token;
        setStatus('Checking the previous upload so it can resume...');
      } else {
        if (resume && resume.token) {
          try {
            await postJson('api/upload/abort', { password, token: resume.token });
          } catch (_) {
            // It may already have expired or been cleaned up.
          }
          saveResume(null);
        }
        setStatus('Preparing secure upload...');
        const started = await postJson('api/upload/start', {
          password,
          name: selected.name,
          size: selected.size,
          contentType: selected.type || 'application/octet-stream'
        });
        token = started.token;
        resume = {
          token,
          name: selected.name,
          size: selected.size,
          lastModified: selected.lastModified
        };
        saveResume(resume);
      }

      const statusData = await postJson('api/upload/status', { password, token });
      const completed = new Map(statusData.parts.map(part => [part.partNumber, part]));
      const totalParts = Math.ceil(selected.size / PART_BYTES);
      const missing = [];
      let uploadedBytes = 0;
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const existing = completed.get(partNumber);
        const expectedSize = Math.min(PART_BYTES, selected.size - ((partNumber - 1) * PART_BYTES));
        if (existing && existing.size === expectedSize) uploadedBytes += expectedSize;
        else missing.push(partNumber);
      }
      setUploadProgress(Math.min(100, (uploadedBytes / selected.size) * 100));
      if (missing.length) {
        setStatus('Uploading ' + (totalParts - missing.length) + ' of ' + totalParts + ' parts already complete...');
      } else {
        setStatus('All parts are present. Verifying the completed file...');
      }

      let cursor = 0;
      let fatalError = null;
      async function worker() {
        while (cursor < missing.length && !fatalError) {
          const partNumber = missing[cursor++];
          const start = (partNumber - 1) * PART_BYTES;
          const chunk = selected.slice(start, Math.min(selected.size, start + PART_BYTES));
          let sent = false;
          for (let attempt = 1; attempt <= 3 && !sent; attempt++) {
            try {
              const response = await fetch(API_BASE + 'api/upload/part', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'X-Share-Password': password,
                  'X-Share-Upload-Token': token,
                  'X-Share-Part-Number': String(partNumber)
                },
                body: chunk
              });
              const data = await readJson(response);
              if (!response.ok) throw new Error(data.error || 'Part ' + partNumber + ' failed.');
              sent = true;
              uploadedBytes += chunk.size;
              setUploadProgress(Math.min(100, (uploadedBytes / selected.size) * 100));
              setStatus('Uploading part ' + partNumber + ' of ' + totalParts + ' • ' + sizeLabel(uploadedBytes) + ' / ' + sizeLabel(selected.size));
            } catch (error) {
              if (attempt === 3) fatalError = error;
              else {
                setStatus('Retrying part ' + partNumber + ' (' + (attempt + 1) + '/3)...');
                await new Promise(resolve => window.setTimeout(resolve, attempt * 700));
              }
            }
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()));
      if (fatalError) throw fatalError;

      setStatus('All chunks uploaded. Assembling and verifying the file...');
      const finished = await postJson('api/upload/complete', { password, token });
      saveResume(null);
      await refresh(password);
      setSelected(null);
      if (fileInput.current) fileInput.current.value = '';
      setUploadProgress(null);
      setStatus('Upload complete. The file is available for 10 minutes.');
      return finished.file;
    } catch (error) {
      if (/invalid or has expired|expired/i.test(error.message || '')) saveResume(null);
      setStatus((error.message || 'Upload failed.') + ' Select the same file and retry to resume completed chunks.');
    } finally {
      setBusy(false);
    }
  }

  async function download(file) {
    setBusy(true);
    setStatus('Preparing protected download...');
    try {
      const data = await postJson('api/download-url', { password, key: file.key });
      const anchor = document.createElement('a');
      anchor.href = data.url;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setStatus('Download started. The private storage link expires shortly.');
      await refresh(password);
    } catch (error) {
      setStatus(error.message || 'Download failed.');
      try { await refresh(password); } catch (_) { lock(); }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!unlocked) return undefined;
    const timer = window.setInterval(() => {
      refresh(password).catch(error => setStatus(error.message || 'Could not refresh the file list.'));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [unlocked, password]);

  const activeFiles = files.filter(file => new Date(file.expiresAt).getTime() > now);
  const resume = readResume();
  const canResume = sameFile(resume, selected);

  return h('section', { className: 'temporary-share-section blog-reveal', id: 'share-folder' },
    h('div', { className: 'temporary-share-card' },
      h('div', { className: 'temporary-share-heading' },
        h('div', { className: 'temporary-share-icon', 'aria-hidden': 'true' }, '↗'),
        h('div', { className: 'temporary-share-title-wrap' },
          h('div', { className: 'small-label' }, 'PRIVATE FILE DROP / 10 MINUTES'),
          h('h2', null, 'Temporary Share Folder'),
          h('p', null, 'Share files and media securely. Each upload is available for 10 minutes.')
        ),
        unlocked ? h('button', { type: 'button', className: 'temporary-share-lock', onClick: lock, disabled: busy }, 'Lock folder') : null
      ),
      unlocked ? h(React.Fragment, null,
        h('form', { className: 'temporary-share-upload', onSubmit: upload },
          h('label', { className: 'temporary-share-file-picker', htmlFor: 'temporaryShareFile' },
            h('span', { className: 'temporary-share-upload-symbol', 'aria-hidden': 'true' }, '+'),
            h('span', null,
              h('strong', null, selected ? selected.name : 'Choose any file or media'),
              h('small', null, selected ? sizeLabel(selected.size) + ' / ' + (selected.size > MAX_BYTES ? 'File is larger than 1 GB' : canResume ? 'Previous upload found / ready to resume' : 'Ready to upload') : 'Photos / Videos / Documents / ZIP / Any format / Up to 1 GB')
            )
          ),
          h('input', {
            ref: fileInput, id: 'temporaryShareFile', className: 'temporary-share-file-input', type: 'file',
            onChange: event => setSelected(event.target.files && event.target.files[0] || null)
          }),
          h('button', { type: 'submit', className: 'temporary-share-upload-button', disabled: busy || !selected || selected.size > MAX_BYTES },
            busy ? 'Uploading...' : canResume ? 'Resume upload' : 'Upload for 10 minutes'
          )
        ),
        uploadProgress !== null ? h('div', { className: 'temporary-share-progress-wrap', 'aria-live': 'polite' },
          h('div', { className: 'temporary-share-progress-meta' },
            h('span', null, 'UPLOAD PROGRESS'),
            h('strong', null, Math.round(uploadProgress) + '%')
          ),
          h('div', { className: 'temporary-share-progress-track' },
            h('div', { className: 'temporary-share-progress-fill', style: { width: uploadProgress + '%' } })
          ),
          h('small', null, '8 MB chunks / automatic retry / reselect the same file to resume after refreshing this page')
        ) : null,
        h('div', { className: 'temporary-share-list-heading' },
          h('strong', null, 'Available files'),
          h('span', null, activeFiles.length + ' FILE' + (activeFiles.length === 1 ? '' : 'S'))
        ),
        activeFiles.length ? h('div', { className: 'temporary-share-file-list' }, activeFiles.map(file => {
          const left = new Date(file.expiresAt).getTime() - now;
          return h('div', { className: 'temporary-share-file', key: file.key },
            h('div', { className: 'temporary-share-file-info' },
              h('span', { className: 'temporary-share-file-icon', 'aria-hidden': 'true' }, '▤'),
              h('span', { className: 'temporary-share-file-copy' },
                h('strong', { title: file.name }, file.name),
                h('small', null, sizeLabel(file.size) + ' / expires in ' + countdown(file.expiresAt, now))
              )
            ),
            h('button', { type: 'button', className: 'temporary-share-download', disabled: busy || left <= 0, onClick: () => download(file) }, 'Download ↓')
          );
        })) : h('div', { className: 'temporary-share-empty' },
          h('span', { 'aria-hidden': 'true' }, '⌁'),
          h('strong', null, 'No active files'),
          h('small', null, 'Upload a file to create a temporary download.')
        )
      ) : h('form', { className: 'temporary-share-unlock', onSubmit: unlock },
        h('label', { htmlFor: 'temporarySharePassword' }, 'Folder password'),
        h('div', { className: 'temporary-share-password-row' },
          h('input', {
            id: 'temporarySharePassword', type: 'password', inputMode: 'numeric', autoComplete: 'current-password',
            value: password, onChange: event => setPassword(event.target.value), placeholder: 'Enter password', required: true
          }),
          h('button', { type: 'submit', disabled: busy }, busy ? 'Checking...' : 'Unlock folder')
        )
      ),
      h('p', { className: 'temporary-share-status', role: 'status', 'aria-live': 'polite' }, status),
      h('div', { className: 'temporary-share-footnote' },
        h('span', null, 'PASSWORD REQUIRED'),
        h('span', null, 'AUTO DELETE / 10:00'),
        h('span', null, 'PRIVATE STORAGE'),
        h('span', null, 'MAX FILE / 1 GB')
      )
    )
  );
}
