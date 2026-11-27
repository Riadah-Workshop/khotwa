'use client';
import {useCallback, useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';

export type AskRequest = {message: string; yes: string; no: string; danger?: boolean; run: () => void};

/**
 * A question that has to be answered before something is done ("Delete this?"), asked in a bar at the top of the
 * page instead of the browser's confirm() box. There is no backdrop and nothing else is blocked; the answer "No"
 * has the focus so a stray Enter does not do the thing. Put `node` anywhere in the component's output.
 */
export function useAsk(): {ask: (request: AskRequest) => void; node: ReactNode} {
  const [request, setRequest] = useState<AskRequest | null>(null);
  const ask = useCallback((next: AskRequest) => setRequest(next), []);
  // Drawn straight into <body> so no animated or transformed ancestor can move a fixed bar away from the screen edge.
  const node = request ? createPortal(<div className="ask-bar" role="alert">
    <span className="ask-text">{request.message}</span>
    <span className="ask-buttons">
      <button type="button" className={'ask-yes' + (request.danger ? ' is-danger' : '')} onClick={() => { const run = request.run; setRequest(null); run(); }}>{request.yes}</button>
      <button type="button" className="ask-no" autoFocus onClick={() => setRequest(null)}>{request.no}</button>
    </span>
  </div>, document.body) : null;
  return {ask, node};
}
