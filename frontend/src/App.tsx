import { FormEvent, useCallback, useEffect, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Sidebar } from '@/components/layout/Sidebar';
import { CampaignsPage } from '@/pages/CampaignsPage';
import { CampaignDetailPage } from '@/pages/CampaignDetailPage';
import { LeadsPage } from '@/pages/LeadsPage';
import { LeadDetailPage } from '@/pages/LeadDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { useTheme } from '@/hooks/useTheme';
import { sectionOf, type NavSection, type Route } from '@/lib/nav';
import { api } from '@/api/client';

const TOKEN_KEY = 'ems.adminToken';

function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api.login(username, password);
      localStorage.setItem(TOKEN_KEY, result.accessToken); onLogin();
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign in failed'); }
    finally { setBusy(false); }
  };
  return <main className="grid min-h-screen place-items-center bg-background p-6"><form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-7 shadow-sm">
    <div><h1 className="text-2xl font-semibold">Email Marketing</h1><p className="mt-1 text-sm text-muted-foreground">Sign in to the admin workspace</p></div>
    <label className="block text-sm">Username<input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
    <label className="block text-sm">Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
    {error && <p className="text-sm text-destructive">{error}</p>}<button disabled={busy} className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground">{busy ? 'Signing in…' : 'Sign in'}</button>
  </form></main>;
}

/**
 * Dashboard shell: a persistent sidebar + the routed content column. A tiny
 * in-app router switches between the campaign and lead pages (list + detail).
 */
export default function App() {
  const [authenticated, setAuthenticated] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  useEffect(() => {
    const unauthorized = () => { localStorage.removeItem(TOKEN_KEY); setAuthenticated(false); };
    window.addEventListener('ems:unauthorized', unauthorized);
    return () => window.removeEventListener('ems:unauthorized', unauthorized);
  }, []);
  const { isDark, toggle } = useTheme();
  const [route, setRoute] = useState<Route>({ name: 'campaigns' });

  const navigate = useCallback((next: Route) => setRoute(next), []);
  const onNavigateSection = useCallback((section: NavSection) => {
    setRoute(
      section === 'leads'
        ? { name: 'leads' }
        : section === 'settings'
          ? { name: 'settings' }
          : { name: 'campaigns' },
    );
  }, []);

  const shared = { isDark, onToggleTheme: toggle, navigate };

  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        <Sidebar
          isDark={isDark}
          onToggleTheme={toggle}
          active={sectionOf(route)}
          onNavigate={onNavigateSection}
        />
        <div className="app-aurora relative flex min-h-screen flex-1 flex-col">
          <div className="relative z-10 flex flex-1 flex-col">
            {route.name === 'campaigns' && <CampaignsPage {...shared} />}
            {route.name === 'campaign' && (
              <CampaignDetailPage key={route.id} id={route.id} {...shared} />
            )}
            {route.name === 'leads' && <LeadsPage {...shared} />}
            {route.name === 'lead' && (
              <LeadDetailPage key={route.id} id={route.id} {...shared} />
            )}
            {route.name === 'settings' && (
              <SettingsPage isDark={isDark} onToggleTheme={toggle} />
            )}
          </div>
        </div>
      </div>
      <Toaster
        theme={isDark ? 'dark' : 'light'}
        position="top-right"
        richColors
        closeButton
      />
    </TooltipProvider>
  );
}
