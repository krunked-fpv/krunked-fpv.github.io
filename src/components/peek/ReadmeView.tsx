import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { fetchReadme } from '../../data/enrich';
import { HttpError } from '../../data/ghClient';
import type { GhRepo } from '../../types/github';

export function ReadmeView({ repo }: { repo: GhRepo }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [html, setHtml] = useState<string>('');
  const [errMsg, setErrMsg] = useState<string>('');

  const load = useCallback(async () => {
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
      <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-mute">
        No README published for <span className="mono text-dim">{repo.name}</span>.{' '}
        <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-volt hover:underline">
          View on GitHub <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-alarm/25 bg-alarm/5 px-4 py-3 text-[13px] text-dim">
        <span>{errMsg}</span>
        <button type="button" onClick={() => void load()} className="btn min-h-8! gap-1.5 text-[12px]">
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  // Sanitized via DOMPurify in fetchReadme()
  return <div className="readme" dangerouslySetInnerHTML={{ __html: html }} />;
}
