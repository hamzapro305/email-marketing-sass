import { useEffect, useState } from 'react';
import { API_BASE } from '../api/client';

type Connection = 'connecting' | 'online' | 'offline';

interface Health {
  connection: Connection;
  emailMode: 'demo' | 'live' | null;
}

/** Polls the backend health endpoint to show connectivity + active email mode. */
export function useHealth(): Health {
  const [health, setHealth] = useState<Health>({
    connection: 'connecting',
    emailMode: null,
  });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (!res.ok) throw new Error('bad status');
        const body = (await res.json()) as { emailMode?: 'demo' | 'live' };
        if (alive)
          setHealth({
            connection: 'online',
            emailMode: body.emailMode ?? null,
          });
      } catch {
        if (alive) setHealth((h) => ({ ...h, connection: 'offline' }));
      }
    };
    void check();
    const id = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return health;
}
