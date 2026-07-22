import { HeroUIProvider, ToastProvider } from '@heroui/react';
import { WorkflowPage } from './pages/WorkflowPage';

/**
 * App shell: HeroUI provider (theming + components) plus the global toast
 * outlet. The desktop window renders a single workflow screen.
 */
export default function App() {
  return (
    <HeroUIProvider>
      <ToastProvider placement="top-right" toastOffset={12} />
      <main className="min-h-screen bg-background text-foreground">
        <WorkflowPage />
      </main>
    </HeroUIProvider>
  );
}
