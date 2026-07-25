import { useCallback, useState } from 'react';
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

/**
 * Dashboard shell: a persistent sidebar + the routed content column. A tiny
 * in-app router switches between the campaign and lead pages (list + detail).
 */
export default function App() {
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
