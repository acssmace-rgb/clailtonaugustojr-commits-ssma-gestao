import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, getTenant, setTenant } from './api';
import type { Brand } from './brand';

export interface Me {
  user: { id: string; email: string; name: string; isSuperAdmin: boolean; mfaEnabled: boolean };
  mfaPending: boolean;
  tenants: { id: string; name: string; isDemo: boolean; role: string }[];
  currentTenant: { id: string; name: string; isDemo: boolean } | null;
  permissions: string[];
  scope: { companyIds: string[]; unitIds: string[] } | null;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  brand: Brand;
  can: (...perms: string[]) => boolean;
  switchTenant: (id: string) => void;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children, brand }: { children: ReactNode; brand: Brand }) {
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState(getTenant());
  const q = useQuery({
    queryKey: ['me', tenantId],
    queryFn: async () => {
      try {
        return await get<Me>('/auth/me');
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  // Seleciona automaticamente o primeiro cliente disponível
  useEffect(() => {
    const me = q.data;
    if (!me || me.mfaPending) return;
    const valid = me.tenants.some((t) => t.id === tenantId);
    if ((!tenantId || !valid) && me.tenants.length) {
      setTenant(me.tenants[0].id);
      setTenantId(me.tenants[0].id);
    }
  }, [q.data, tenantId]);

  useEffect(() => {
    const onUnauthorized = () => qc.invalidateQueries({ queryKey: ['me'] });
    window.addEventListener('ssma:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ssma:unauthorized', onUnauthorized);
  }, [qc]);

  const switchTenant = useCallback(
    (id: string) => {
      setTenant(id);
      setTenantId(id);
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    },
    [qc],
  );

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    qc.clear();
    window.location.href = '/login';
  }, [qc]);

  const value = useMemo<AuthCtx>(() => {
    const perms = new Set(q.data?.permissions ?? []);
    return {
      me: q.data ?? null,
      loading: q.isLoading,
      brand,
      can: (...p) => p.every((x) => perms.has(x)),
      switchTenant,
      refresh: () => q.refetch(),
      logout,
    };
  }, [q, brand, switchTenant, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
