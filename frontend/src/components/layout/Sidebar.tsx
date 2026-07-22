import {
  LayoutDashboard,
  Users,
  FileText,
  BarChart3,
  Settings,
  Mail,
  Moon,
  Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useHealth } from '@/hooks/useHealth';

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  soon?: boolean;
}

// The workflow lives under "Campaigns" today; the rest are placeholders that
// signal where future features will slot in.
const NAV: NavItem[] = [
  { label: 'Campaigns', icon: LayoutDashboard, active: true },
  { label: 'Leads', icon: Users, soon: true },
  { label: 'Templates', icon: FileText, soon: true },
  { label: 'Analytics', icon: BarChart3, soon: true },
  { label: 'Settings', icon: Settings, soon: true },
];

function ConnectionDot({
  state,
}: {
  state: 'connecting' | 'online' | 'offline';
}) {
  const color =
    state === 'online'
      ? 'bg-success'
      : state === 'offline'
        ? 'bg-destructive'
        : 'bg-warning';
  return (
    <span className="relative flex h-2 w-2">
      {state === 'online' && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Sidebar({ isDark, onToggleTheme }: Props) {
  const { connection, emailMode } = useHealth();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shadow-primary/30">
          <Mail className="h-[18px] w-[18px]" />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              Mailflow
            </span>
            <Badge variant="default" className="px-1.5 py-0 text-[10px]">
              demo
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Email marketing
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              disabled={item.soon}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                item.active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
                item.soon && 'cursor-not-allowed opacity-60 hover:bg-transparent',
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.soon && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="space-y-3 border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <ConnectionDot state={connection} />
            <span className="text-xs font-medium text-muted-foreground">
              {connection === 'online'
                ? emailMode
                  ? `${emailMode} mode`
                  : 'Connected'
                : connection === 'offline'
                  ? 'Backend offline'
                  : 'Connecting…'}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 px-3 text-sidebar-foreground"
          onClick={onToggleTheme}
        >
          {isDark ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
          {isDark ? 'Light mode' : 'Dark mode'}
        </Button>
      </div>
    </aside>
  );
}
