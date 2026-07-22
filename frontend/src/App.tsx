import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Sidebar } from '@/components/layout/Sidebar';
import { WorkflowPage } from '@/pages/WorkflowPage';
import { useTheme } from '@/hooks/useTheme';

/**
 * Dashboard shell: a persistent sidebar + the main workflow column. Built on
 * shadcn/ui primitives so new pages/features can slot in cleanly.
 */
export default function App() {
  const { isDark, toggle } = useTheme();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        <Sidebar isDark={isDark} onToggleTheme={toggle} />
        <div className="app-aurora relative flex min-h-screen flex-1 flex-col">
          <div className="relative z-10 flex flex-1 flex-col">
            <WorkflowPage isDark={isDark} onToggleTheme={toggle} />
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
