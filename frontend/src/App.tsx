import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { slugify } from './slug';
import { api, TENANTS, type AskResponse, type ChunkRow, type DocumentRow, type RetrievedChunk, type Strategy } from './api';

type Result =
  | { kind: 'ask'; data: AskResponse }
  | { kind: 'search'; chunks: RetrievedChunk[] };

export default function App() {
  const [tenant, setTenant] = useState<string>(TENANTS[0]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (selectCurrent = false) => {
    try {
      const rows = await api.listDocuments(tenant);
      setDocs(rows);
      if (selectCurrent) setSelected(new Set(rows.filter((d) => d.is_current).map((d) => d.id)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tenant]);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  return (
    <div className="app">
      <header>
        <h1>NUSAskify</h1>
        <span className="muted">Internal policy Q&amp;A</span>
        <label className="tenant">
          Tenant
          <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
            {TENANTS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <a href="http://localhost:3000/api-docs" target="_blank" rel="noreferrer">API docs ↗</a>
      </header>
      {error && <div className="alert error">{error}</div>}

      <main>
        <section className="col">
          <UploadForm tenant={tenant} onUploaded={() => refresh(true)} />
          <DocumentList
            tenant={tenant}
            docs={docs}
            selected={selected}
            setSelected={setSelected}
            onChanged={() => refresh()}
          />
        </section>
        <section className="col">
          <AskPanel key={tenant} tenant={tenant} selected={[...selected]} />
        </section>
      </main>
    </div>
  );
}

function UploadForm({ tenant, onUploaded }: { tenant: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [docKey, setDocKey] = useState('');
  // Doc key follows the title until the user edits it by hand (clearing it resumes auto-fill).
  const [docKeyEdited, setDocKeyEdited] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.uploadDocument(tenant, new FormData(form));
      setMsg({
        ok: true,
        text: `Indexed "${r.document.title}" v${r.document.version}: ${r.chunk_counts.semantic} semantic / ${r.chunk_counts.structure} structure chunks` +
          (r.expired_versions.length ? ` · expired ${r.expired_versions.length} older version(s)` : ''),
      });
      form.reset();
      setDocKey('');
      setDocKeyEdited(false);
      onUploaded();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card upload" onSubmit={submit}>
      <h2>Upload document <span className="muted">→ {tenant}</span></h2>
      <input type="file" name="file" accept=".pdf,.docx,.odt" required />
      <div className="grid2">
        <label>Title<input name="title" required placeholder="Remote Work Policy"
          onChange={(e) => { if (!docKeyEdited) setDocKey(slugify(e.target.value)); }} /></label>
        <label>Doc key<input name="doc_key" required placeholder="remote-work" pattern="[a-z0-9-]+" maxLength={64}
          title="lowercase letters, digits and -"
          value={docKey}
          onChange={(e) => { setDocKey(e.target.value); setDocKeyEdited(e.target.value !== ''); }} /></label>
        <label>Version<input name="version" type="number" min={1} defaultValue={1} required /></label>
        <span />
        <label>Valid from<input name="valid_from" type="date" defaultValue="2000-01-01" required /></label>
        <label><span>Valid to <span className="muted">(optional)</span></span><input name="valid_to" type="date" /></label>
      </div>
      <button disabled={busy}>{busy ? 'Ingesting… (parse → chunk → embed)' : 'Upload & ingest'}</button>
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'error'}`}>{msg.text}</div>}
    </form>
  );
}

function DocumentList(props: {
  tenant: string;
  docs: DocumentRow[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onChanged: () => void;
}) {
  const { tenant, docs, selected, setSelected, onChanged } = props;
  const [openDoc, setOpenDoc] = useState<DocumentRow | null>(null);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  async function remove(d: DocumentRow) {
    if (!confirm(`Delete "${d.title}" v${d.version} and all its chunks?`)) return;
    await api.deleteDocument(tenant, d.id);
    selected.delete(d.id);
    setSelected(new Set(selected));
    onChanged();
  }

  return (
    <div className="card">
      <h2>
        Documents <span className="muted">({selected.size} selected = search scope)</span>
      </h2>
      {docs.length === 0 && <p className="muted">No documents for tenant “{tenant}” yet.</p>}
      <ul className="doclist">
        {docs.map((d) => (
          <li key={d.id}>
            <div className="docrow">
              <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
              <div className="docmeta">
                <strong>{d.title}</strong> <span className="tag">v{d.version}</span>{' '}
                <span className={`tag ${d.is_current ? 'current' : 'expired'}`}>
                  {d.is_current ? 'current' : d.status === 'expired' ? 'expired' : 'not valid today'}
                </span>
                <div className="muted small">
                  {d.doc_key} · {d.valid_from} → {d.valid_to ?? '∞'} · {d.file_name} · {d.semantic_chunks}/{d.structure_chunks} chunks
                </div>
              </div>
              <button className="link" onClick={() => setOpenDoc(d)}>chunks</button>
              <button className="link danger" onClick={() => remove(d)}>delete</button>
            </div>
          </li>
        ))}
      </ul>
      {openDoc && <ChunkModal tenant={tenant} doc={openDoc} onClose={() => setOpenDoc(null)} />}
    </div>
  );
}

/** Near-full-screen modal: semantic vs. structure chunks of one document, side by side. */
function ChunkModal({ tenant, doc, onClose }: { tenant: string; doc: DocumentRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Chunks of ${doc.title}`}>
        <div className="modal-head">
          <div className="docmeta">
            <strong>{doc.title}</strong> <span className="tag">v{doc.version}</span>
            <div className="muted small">{doc.doc_key} · {doc.file_name}</div>
          </div>
          <button type="button" className="link" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <ChunkColumn tenant={tenant} docId={doc.id} strategy="semantic" />
          <ChunkColumn tenant={tenant} docId={doc.id} strategy="structure" />
        </div>
      </div>
    </div>
  );
}

function ChunkColumn({ tenant, docId, strategy }: { tenant: string; docId: string; strategy: Strategy }) {
  const [rows, setRows] = useState<ChunkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    api.chunks(tenant, docId, strategy).then(setRows).catch((e: Error) => { setError(e.message); setRows([]); });
  }, [tenant, docId, strategy]);

  const avg = rows?.length ? Math.round(rows.reduce((n, c) => n + c.char_count, 0) / rows.length) : 0;

  return (
    <section className="chunkcol">
      <h3>
        {strategy}{' '}
        <span className="muted small">{rows ? `${rows.length} chunks · avg ${avg} chars` : 'loading…'}</span>
      </h3>
      <div className="chunkscroll">
        {error && <div className="alert error">{error}</div>}
        {rows?.map((c) => (
          <div key={c.id} className="chunk">
            <span className="muted small">#{c.chunk_index} · {c.char_count} chars</span>
            <pre className="chunktext">{c.content}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}

function StrategyToggle({ value, onChange }: { value: Strategy; onChange: (s: Strategy) => void }) {
  return (
    <div className="toggle">
      {(['semantic', 'structure'] as Strategy[]).map((s) => (
        <button key={s} type="button" className={value === s ? 'on' : ''} onClick={() => onChange(s)}>{s}</button>
      ))}
    </div>
  );
}

function AskPanel({ tenant, selected }: { tenant: string; selected: string[] }) {
  const [question, setQuestion] = useState('');
  const [topK, setTopK] = useState(5);
  const [strategy, setStrategy] = useState<Strategy>('semantic');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'ask' | 'search') {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body = { question, document_ids: selected.length ? selected : undefined, top_k: topK, strategy };
      if (kind === 'ask') setResult({ kind, data: await api.ask(tenant, body) });
      else setResult({ kind, chunks: (await api.search(tenant, body)).chunks });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const chunks = result?.kind === 'ask' ? result.data.chunks : result?.chunks ?? [];
  const cited = new Set(result?.kind === 'ask' ? result.data.citations.map((c) => c.chunk_id) : []);

  return (
    <>
      <form className="card" onSubmit={(e) => { e.preventDefault(); void run('ask'); }}>
        <h2>Ask a question</h2>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. How many days a week can I work from home?"
          rows={3}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run('ask'); }}
        />
        <div className="controls">
          <StrategyToggle value={strategy} onChange={setStrategy} />
          <label className="inline">top_k <input type="number" min={1} max={20} value={topK} onChange={(e) => setTopK(Number(e.target.value))} /></label>
          <span className="spacer" />
          <button type="button" className="secondary" disabled={busy} onClick={() => run('search')}>Search only</button>
          <button disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button>
        </div>
        {selected.length === 0 && <p className="muted small">No document selected → searching all valid documents of this tenant.</p>}
      </form>

      {error && <div className="alert error">{error}</div>}

      {result?.kind === 'ask' && (
        <div className={`card answer ${result.data.status}`}>
          <h2>
            Answer <span className={`tag ${result.data.status === 'answered' ? 'current' : 'expired'}`}>{result.data.status}</span>
          </h2>
          <p className="answertext"><AnswerText text={result.data.answer} /></p>
          {result.data.reason && <p className="muted small">Reason: {result.data.reason}</p>}
          {result.data.citations.length > 0 && (
            <ul className="citations">
              {result.data.citations.map((c) => (
                <li key={c.marker}>
                  <a href={`#chunk-${c.chunk_id}`}>[{c.marker}]</a> {c.title} v{c.version} · chunk #{c.chunk_index}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && (
        <div className="card">
          <h2>Retrieved chunks <span className="muted">({chunks.length})</span></h2>
          {chunks.length === 0 && <p className="muted">No chunks passed the tenant / document / validity filter.</p>}
          {chunks.map((c, i) => (
            <div key={c.chunk_id} id={`chunk-${c.chunk_id}`} className={`chunk ${cited.has(c.chunk_id) ? 'cited' : ''}`}>
              <div className="chunkhead">
                <span className="marker">[{i + 1}]</span>
                <strong>{c.title}</strong> <span className="tag">v{c.version}</span>
                <span className="muted small">chunk #{c.chunk_index}</span>
                <span className="spacer" />
                <span className="score" title="cosine similarity">
                  <span className="bar" style={{ width: `${Math.max(0, c.score) * 100}%` }} />
                  {c.score.toFixed(3)}
                </span>
              </div>
              <pre className="chunktext">{c.content}</pre>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Renders [n] markers as links to the matching retrieved chunk card. */
function AnswerText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[\d+\])/g).map((part, i) =>
        /^\[\d+\]$/.test(part) ? <sup key={i} className="cite">{part}</sup> : <span key={i}>{part}</span>,
      )}
    </>
  );
}
