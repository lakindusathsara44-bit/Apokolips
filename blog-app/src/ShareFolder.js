import React, { useEffect, useRef, useState } from 'react';

const h = React.createElement;
const API_BASE = 'https://br-silent-frost-b3chnc64-aposhare.compute.c-4.ap-southeast-1.aws.neon.tech/';
const MAX_BYTES = 100 * 1024 * 1024;

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

export default function ShareFolder() {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Enter the password to open the temporary file area.');
  const [now, setNow] = useState(Date.now());
  const fileInput = useRef(null);

  async function refresh(pass = password) {
    const response = await fetch(API_BASE + 'api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || 'Could not load shared files.');
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
    if (fileInput.current) fileInput.current.value = '';
    setStatus('Folder locked. Enter the password to continue.');
  }

  async function upload(event) {
    event.preventDefault();
    if (!selected) return;
    if (selected.size > MAX_BYTES) {
      setStatus('The maximum file size is 100 MB.');
      return;
    }
    setBusy(true);
    setStatus('Uploading securely...');
    try {
      const form = new FormData();
      form.append('password', password);
      form.append('file', selected, selected.name);
      const response = await fetch(API_BASE + 'api/upload', { method: 'POST', body: form });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      await refresh(password);
      setSelected(null);
      if (fileInput.current) fileInput.current.value = '';
      setStatus('Upload complete. The file expires automatically after 10 minutes.');
    } catch (error) {
      setStatus(error.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function download(file) {
    setBusy(true);
    setStatus('Preparing protected download...');
    try {
      const response = await fetch(API_BASE + 'api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, key: file.key })
      });
      if (!response.ok) {
        const data = await readJson(response);
        throw new Error(data.error || 'Download failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name || 'shared-file';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setStatus('Download started.');
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

  return h('section', { className: 'temporary-share-section blog-reveal', id: 'share-folder' },
    h('div', { className: 'temporary-share-card' },
      h('div', { className: 'temporary-share-heading' },
        h('div', { className: 'temporary-share-icon', 'aria-hidden': 'true' }, '↗'),
        h('div', { className: 'temporary-share-title-wrap' },
          h('div', { className: 'small-label' }, 'PRIVATE FILE DROP / 10 MINUTES'),
          h('h2', null, 'Temporary Share Folder'),
          h('p', null, 'Share files and media securely. Each upload is available for 10 minutes.')
        ),
        unlocked ? h('button', { type: 'button', className: 'temporary-share-lock', onClick: lock }, 'Lock folder') : null
      ),
      unlocked ? h(React.Fragment, null,
        h('form', { className: 'temporary-share-upload', onSubmit: upload },
          h('label', { className: 'temporary-share-file-picker', htmlFor: 'temporaryShareFile' },
            h('span', { className: 'temporary-share-upload-symbol', 'aria-hidden': 'true' }, '+'),
            h('span', null,
              h('strong', null, selected ? selected.name : 'Choose any file or media'),
              h('small', null, selected ? sizeLabel(selected.size) : 'Photos / Videos / Documents / ZIP / Any format / Up to 100 MB')
            )
          ),
          h('input', {
            ref: fileInput, id: 'temporaryShareFile', className: 'temporary-share-file-input', type: 'file',
            onChange: event => setSelected(event.target.files && event.target.files[0] || null)
          }),
          h('button', { type: 'submit', className: 'temporary-share-upload-button', disabled: busy || !selected },
            busy ? 'Uploading...' : 'Upload for 10 minutes'
          )
        ),
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
        h('span', null, 'PRIVATE STORAGE')
      )
    )
  );
}
