import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Upload } from 'lucide-react';
import { itemsApi } from '../api/client';
import { PhotoThumb, shrinkImage } from './Photo';

export default function MaterialPhoto({ value, onChange, disabled, error, onBusyChange }) {
  const input = useRef(null);
  const nativeCamera = useRef(null);
  const live = useRef(true);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setMessage('Choose a JPG, PNG, WEBP or GIF photo.'); return;
    }
    setBusy(true); onBusyChange?.(true); setMessage('');
    try {
      const result = await itemsApi.upload(await shrinkImage(file));
      if (live.current) onChange(result.data.path);
    } catch (e) { if (live.current) setMessage(e.message); }
    finally { if (live.current) { setBusy(false); onBusyChange?.(false); } }
  };
  const pick = (e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); };
  const startCamera = () => {
    setMessage('');
    if (navigator.mediaDevices?.getUserMedia) setCamera(true);
    else nativeCamera.current?.click();
  };
  return <div className="space-y-2">
    {value ? <PhotoThumb path={value} title="Material photo" className="h-32 w-32" /> : <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-gray-500">No photo</div>}
    {!disabled && <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><Upload size={15}/>{value ? 'Replace Photo' : 'Upload Photo'}</button>
      <button type="button" disabled={busy} onClick={startCamera} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><Camera size={15}/>Take Photo</button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Upload material photo" hidden onChange={pick}/>
      <input ref={nativeCamera} type="file" accept="image/*" capture="environment" aria-label="Mobile camera photo" hidden onChange={pick}/>
    </div>}
    {busy && <p role="status" className="text-sm text-gray-600">Uploading photo…</p>}
    {(message || error) && <p role="alert" className="text-xs text-red-600">{message || error}</p>}
    {camera && <CameraCapture onClose={() => setCamera(false)} onCapture={(file) => { setCamera(false); upload(file); }}/ >}
  </div>;
}

function CameraCapture({ onClose, onCapture }) {
  const video = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    let alive = true; let stream;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 } }, audio: false }).then((media) => {
      if (!alive) { media.getTracks().forEach(t => t.stop()); return; }
      stream = media;
      if (video.current) video.current.srcObject = media;
    }).catch((e) => {
      if (alive) setError(e.name === 'NotAllowedError' ? 'Camera access was denied. Allow access in your browser, or close this window and upload a photo.' : 'Camera could not be opened. Check that it is connected and not being used by another app, or upload a photo.');
    });
    return () => { alive = false; stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  const capture = () => {
    const v = video.current;
    if (!v?.videoWidth || !v.videoHeight) return;
    setCapturing(true);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], 'material-camera.jpg', { type: 'image/jpeg' }));
      else { setError('The photo could not be captured. Please try again.'); setCapturing(false); }
    }, 'image/jpeg', 0.85);
  };
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div role="dialog" aria-modal="true" aria-label="Take material photo" className="w-full max-w-2xl space-y-3 rounded-xl bg-white p-4">
    <h2 className="font-semibold">Take Material Photo</h2>
    <video ref={video} autoPlay playsInline muted onCanPlay={() => setReady(true)} className="max-h-[60vh] w-full rounded-lg bg-black"/>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!ready && !error && <p className="text-sm text-gray-600">Opening camera… Allow camera access when prompted.</p>}
    <div className="flex justify-end gap-2"><button type="button" disabled={capturing} onClick={onClose} className="rounded-lg border px-3 py-2">Cancel Camera</button><button type="button" disabled={!ready || capturing} onClick={capture} className="rounded-lg bg-brand-600 px-4 py-2 text-white disabled:opacity-50">{capturing ? 'Capturing…' : 'Capture Photo'}</button></div>
  </div></div>, document.body);
}
