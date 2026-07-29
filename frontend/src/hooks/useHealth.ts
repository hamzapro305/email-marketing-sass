import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../api/client';
import { qk } from '../api/query';

type Connection = 'connecting' | 'online' | 'offline';

interface Health {
  connection: Connection;
}

/** Polls the backend health endpoint to show connectivity. */
export function useHealth(): Health {
  const query = useQuery({
    queryKey: qk.health,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) throw new Error('bad status');
      return true;
    },
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 0,
  });

  const connection: Connection = query.isPending
    ? 'connecting'
    : query.isError
      ? 'offline'
      : 'online';

  return { connection };
}
