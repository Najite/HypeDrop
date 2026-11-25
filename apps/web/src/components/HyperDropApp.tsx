'use client';

import * as React from 'react';
import { HyperDropShell } from './HyperDropShell';
import { LandingPage } from './LandingPage';
import { Toaster } from './ui/sonner';

type ActiveView = 'landing' | 'copilot';

function resolveInitialView(): ActiveView {
  if (typeof window === 'undefined') {
    return 'landing';
  }
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  if (
    path === '/copilot' ||
    params.get('view') === 'copilot' ||
    params.get('autostart') === '1'
  ) {
    return 'copilot';
  }
  return 'landing';
}

export function HyperDropApp() {
  const [view, setView] = React.useState<ActiveView>(() => resolveInitialView());

  React.useEffect(() => {
    const handlePopState = () => {
      setView(resolveInitialView());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openCopilot = React.useCallback(() => {
    setView('copilot');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'copilot');
      url.hash = '';
      window.history.pushState({ view: 'copilot' }, '', url.toString());
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const openLanding = React.useCallback(() => {
    setView('landing');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('autostart');
      if (url.pathname === '/copilot') {
        url.pathname = '/';
      }
      url.hash = '';
      window.history.pushState({ view: 'landing' }, '', url.toString());
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  return (
    <>
      {view === 'copilot' ? (
        <HyperDropShell onNavigateHome={openLanding} hideToaster />
      ) : (
        <LandingPage onLaunchCopilot={openCopilot} />
      )}
      <Toaster />
    </>
  );
}
