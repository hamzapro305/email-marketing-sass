import { QueryClient } from '@tanstack/react-query';

/**
 * Single shared React Query client for the app. Sensible defaults for a
 * dashboard that talks to a load-balanced backend: retry transient failures
 * once, don't spam refetches on window focus, and keep data fresh for a few
 * seconds so quick navigations don't re-hit the network.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

/** Centralised query keys so invalidation stays consistent across hooks. */
export const qk = {
  campaigns: ['campaigns'] as const,
  campaign: (id: string) => ['campaign', id] as const,
  campaignLeads: (id: string) => ['campaign', id, 'leads'] as const,
  campaignFiles: (id: string) => ['campaign', id, 'files'] as const,
  leads: ['leads'] as const,
  lead: (id: string) => ['lead', id] as const,
  smtpAccounts: ['smtp-accounts'] as const,
  llmAccounts: ['llm-accounts'] as const,
  aiSettings: ['ai-settings'] as const,
  health: ['health'] as const,
};

/** Normalise unknown errors thrown by the API layer into a string. */
export function errMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
