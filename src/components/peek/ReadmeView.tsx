import { ExternalLink, RefreshCw, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { fetchReadme } from '../../data/enrich';
import { HttpError, syncDisabled } from '../../data/ghClient';
import type { GhRepo } from '../../types/github';

export function ReadmeView({ repo }: { repo: GhRepo }) {
  const paused = syncDisabled();
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'paused' | 'error'>(
    paused ? 'paused' : 'loading',
  );
  const [html, setHtml] = useState<string>('');
  const [errMsg, setErrMsg] = useState<string>('');

  const load = useCallback(async () => {
    if (syncDisabled()) {
      setStatus('paused');
      return;
    }
    setStatus('loading');
    setErrMsg('');
    try {
      const res = await fetchReadme(repo);
      if (!res) {
        setStatus('empty');
        return;
      }
      setHtml(res);
      setStatus('ready');
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        setStatus('empty');
      } else {
        setErrMsg((e as Error).message || 'Could not load README');
        setStatus('error');
      }
    }
  }, [repo]);

  useEffect(() => {
    if (syncDisabled()) {
      setStatus('paused');
      setHtml('');
      return;
    }
    let active = true;
    setStatus('loading');
    setErrMsg('');
    fetchReadme(repo)
      .then((res) => {
        if (!active) return;
        if (!res) {
          setStatus('empty');
          return;
        }
        setHtml(res);
        setStatus('ready');
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof HttpError && e.status === 404) {
          setStatus('empty');
        } else {
          setErrMsg((e as Error).message || 'Could not load README');
          setStatus('error');
        }
      });
    return () => {
      active = false;
    };
  }, [repo]);

  if (status === 'paused') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-hairline bg-inset px-4 py-4 text-[12.5px] text-dim">
        <span className="flex items-center gap-2">
          <WifiOff size={14} className="shrink-0 text-mute" />
          Live README fetching is paused under <code className="mono text-ink">?sync=off</code> snapshot mode.
        </span>
        <a
          href={repo.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mono inline-flex items-center gap-1 text-[11px] font-medium text-hot-ink hover:underline"
        >
          View on GitHub <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-3 py-2" aria-label="Loading README">
        <div className="skeleton h-6 w-2/5" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton mt-2 h-24 w-full" />
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="rounded-[10px] border border-dashed border-hairline-strong px-4 py-6 text-center text-[13px] text-mute">
        No README published for <span className="mono text-dim">{repo.name}</span>.{' '}
        <a
          href={repo.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-hot-ink hover:underline"
        >
          View on GitHub <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[10px] border border-hairline bg-inset px-4 py-3 text-[13px] text-dim">
        <span className="text-alarm-ink">{errMsg}</span>
        <button type="button" onClick={() => void load()} className="btn min-h-8! gap-1.5 text-[12px]">
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  // Strictly sanitized via DOMPurify in fetchReadme()
  return <div className="readme" dangerouslySetInnerHTML={{ __html: html }} />;
}
