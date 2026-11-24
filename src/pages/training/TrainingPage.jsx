import { useEffect, useState } from 'react';
import { FileText, Pencil, Play, Plus } from 'lucide-react';
import { trainingApi } from '../../api/client';
import Modal from '../../components/Modal';
import { inputCls } from '../../components/table';

const primary = 'inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const empty = {
  title: '', module: '', video_url: '', duration: '', menu_path: '', checklist: '',
  sort_order: 0, sales: true, store: true, published: false,
};

function videoSource(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname;
  const [first, second, third] = url.pathname.split('/').slice(1);
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(host)) {
    const id = host === 'youtu.be' ? first : url.searchParams.get('v') || second;
    if (/^[\w-]{11}$/.test(id || '')) return { embed: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const id = first === 'video' ? second : first;
    if (/^\d+$/.test(id || '')) {
      const privacy = url.searchParams.get('h') || (first === 'video' ? '' : second);
      return { embed: `https://player.vimeo.com/video/${id}${privacy ? `?h=${encodeURIComponent(privacy)}` : ''}` };
    }
  }
  if (host === 'drive.google.com') {
    const id = first === 'file' && second === 'd' ? third : url.searchParams.get('id');
    if (/^[\w-]+$/.test(id || '')) return { embed: `https://drive.google.com/file/d/${id}/preview` };
  }
  if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return { media: url.href };
  return { link: url.href };
}

export default function TrainingPage({ manage = false }) {
  const [lessons, setLessons] = useState([]);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [editing, setEditing] = useState(null);
  const [watching, setWatching] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    trainingApi.list(manage)
      .then(result => { if (active) setLessons(result.data); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [manage, revision]);

  const modules = [...new Set(lessons.map(lesson => lesson.module))];
  const query = search.trim().toLowerCase();
  const visible = lessons.filter(lesson =>
    (!module || lesson.module === module) &&
    [lesson.title, lesson.module, lesson.menu_path].some(value => value.toLowerCase().includes(query))
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Search lessons" placeholder="Search lessons" value={search} onChange={e => setSearch(e.target.value)} className={`${inputCls()} w-full sm:max-w-xs`} />
        <select aria-label="Module" value={module} onChange={e => setModule(e.target.value)} className={`${inputCls()} w-full sm:max-w-xs`}>
          <option value="">All modules</option>
          {modules.map(name => <option key={name}>{name}</option>)}
        </select>
        {manage
          ? <button type="button" onClick={() => setEditing({ ...empty, module })} className={primary}><Plus size={16} /> Add Video</button>
          : <a href={trainingApi.sopUrl()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-brand-700"><FileText size={16} /> Training and SOP PDF</a>}
      </div>
      {loading && <p role="status" className="text-sm text-slate-600">Loading lessons…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={() => setRevision(n => n + 1)}>Retry</button></p>}
      {!loading && !error && !visible.length && <p className="rounded-lg border bg-white p-4 text-sm text-slate-600">{lessons.length ? 'No lessons match your filters.' : 'No training videos have been published for your role yet.'}</p>}
      {!loading && !error && modules.map(name => {
        const rows = visible.filter(lesson => lesson.module === name);
        if (!rows.length) return null;
        return (
          <section key={name} className="overflow-hidden rounded-lg border bg-white">
            <h2 className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900">{name}</h2>
            <ul className="divide-y">
              {rows.map(lesson => (
                <li key={lesson.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">{lesson.title}</h3>
                    <p className="text-xs text-slate-600">{[lesson.duration, manage && (Number(lesson.published) ? 'Published' : 'Draft')].filter(Boolean).join(' · ')}</p>
                  </div>
                  {manage ? (
                    <button type="button" aria-label={`Edit ${lesson.title}`} title="Edit" onClick={() => setEditing(lesson)} className="rounded p-2 text-brand-700 hover:bg-brand-50"><Pencil size={17} /></button>
                  ) : (
                    <button type="button" aria-label={`Watch ${lesson.title}`} onClick={() => setWatching(lesson)} className={primary}><Play size={15} /> Watch</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {editing && <LessonForm lesson={editing} modules={modules} onClose={() => setEditing(null)} onSaved={() => {
        setEditing(null);
        setModule('');
        setSearch('');
        setRevision(n => n + 1);
      }} />}
      {watching && <LessonPlayer lesson={watching} onClose={() => setWatching(null)} />}
    </div>
  );
}

function LessonPlayer({ lesson, onClose }) {
  const source = videoSource(lesson.video_url);
  return (
    <Modal open wide="xl" title={lesson.title} onClose={onClose} footer={<button type="button" onClick={onClose} className="btn-dismiss px-4 py-2">Close</button>}>
      <div className="space-y-4">
        {source?.embed && <iframe title={lesson.title} src={source.embed} allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen className="aspect-video w-full rounded-lg bg-slate-900" />}
        {source?.media && <video aria-label={lesson.title} src={source.media} controls playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-slate-900" />}
        {source && <a href={lesson.video_url} target="_blank" rel="noopener noreferrer" className="inline-block text-brand-700 underline">Open video in a new tab</a>}
        {!source && <p>Video unavailable.</p>}
        {lesson.menu_path && <p><strong>Menu path</strong> {lesson.menu_path}</p>}
        {lesson.checklist && (
          <div>
            <h3 className="font-semibold">Checklist</h3>
            <ul className="list-disc space-y-1 pl-5">
              {lesson.checklist.split('\n').filter(line => line.trim()).map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function LessonForm({ lesson, modules, onClose, onSaved }) {
  const [form, setForm] = useState({
    ...lesson,
    sales: Boolean(Number(lesson.sales)), store: Boolean(Number(lesson.store)),
    published: Boolean(Number(lesson.published)),
  });
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const close = () => { if (!busy) onClose(); };

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      await trainingApi.save(lesson.id, form);
      onSaved();
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open wide="xl" title={lesson.id ? 'Edit Video' : 'Add Video'} onClose={close} footer={<>
      <button type="button" disabled={busy} onClick={close} className="btn-dismiss px-4 py-2">Cancel</button>
      <button type="submit" form="training-lesson" disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <form id="training-lesson" onSubmit={save} className="space-y-3">
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          {[
            ['title', 'Title', 'text', 150],
            ['module', 'Module', 'text', 80],
            ['video_url', 'Video URL', 'url', 1000],
            ['duration', 'Duration', 'text', 20],
            ['menu_path', 'Menu path', 'text', 200],
            ['sort_order', 'Display order', 'number'],
          ].map(([key, label, type, maxLength]) => (
            <label key={key} className="block space-y-1 font-medium">
              <span>{label}</span>
              <input type={type} value={form[key]} maxLength={maxLength} min={type === 'number' ? 0 : undefined}
                max={type === 'number' ? 999999 : undefined}
                list={key === 'module' ? 'training-modules' : undefined}
                required={['title', 'module', 'sort_order'].includes(key) || (key === 'video_url' && form.published)}
                onChange={e => update(key, e.target.value)} className={inputCls(fields[key])} />
              {fields[key] && <span className="text-xs text-red-700">{fields[key]}</span>}
            </label>
          ))}
          <datalist id="training-modules">{modules.map(name => <option key={name} value={name} />)}</datalist>
          <label className="block space-y-1 font-medium sm:col-span-2">
            <span>Checklist (one step per line)</span>
            <textarea value={form.checklist} maxLength={5000} rows={3} onChange={e => update('checklist', e.target.value)} className={inputCls(fields.checklist)} />
            {fields.checklist && <span className="text-xs text-red-700">{fields.checklist}</span>}
          </label>
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <span className="font-medium">Visible to</span>
            <span>Admin</span>
            {[['sales', 'Sales'], ['store', 'Store']].map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5"><input type="checkbox" checked={form[key]} onChange={e => update(key, e.target.checked)} /> {label}</label>
            ))}
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={e => update('published', e.target.checked)} /> Published</label>
        </fieldset>
      </form>
    </Modal>
  );
}
