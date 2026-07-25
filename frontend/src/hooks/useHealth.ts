import { useEffect, useState } from 'react';
import { API_BASE } from '../api/client';

type Connection = 'connecting' | 'online' | 'offline';

interface Health {
  connection: Connection;
}

/** Polls the backend health endpoint to show connectivity. */
export function useHealth(): Health {
  const [health, setHealth] = useState<Health>({ connection: 'connecting' });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (!res.ok) throw new Error('bad status');
        if (alive) setHealth({ connection: 'online' });
      } catch {
        if (alive) setHealth({ connection: 'offline' });
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
