import { ChevronRight, Moon, RotateCcw, Sun, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  crumb: string;
  section?: string;
  isDark: boolean;
  onToggleTheme: () => void;
  onReset?: () => void;
  resetDisabled?: boolean;
  showReset?: boolean;
}

export function Header({
  crumb,
  section = 'Campaigns',
  isDark,
  onToggleTheme,
  onReset,
  resetDisabled,
  showReset,
}: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-6 backdrop-blur">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="font-medium text-muted-foreground md:hidden">
          Mailflow
        </span>
        <span className="text-muted-foreground">{section}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
        <span className="font-medium text-foreground">{crumb}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {showReset && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={onReset}
            disabled={resetDisabled}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle theme</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Account"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-[11px] font-semibold text-primary-foreground">
                ME
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Demo workspace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <User className="h-4 w-4" />
              Profile
              <span className="ml-auto text-[10px] text-muted-foreground">
                Soon
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleTheme}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? 'Light mode' : 'Dark mode'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
