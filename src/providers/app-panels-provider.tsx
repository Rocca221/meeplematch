import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type AppNotification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

type AppPanelsValue = {
  isAdmin: boolean;
  suspended: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  notificationsLoading: boolean;
  notificationsError: string;
  refreshNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
  clearNotifications: () => Promise<void>;
  inboxOpen: boolean;
  openInbox: () => void;
  closeInbox: () => void;
  adminOpen: boolean;
  openAdmin: () => void;
  closeAdmin: () => void;
};

const AppPanelsContext = createContext<AppPanelsValue | null>(null);

/**
 * Estado compartido de la app con sesión: rol de administrador, suspensión de
 * la cuenta y bandeja de avisos (con actualización en vivo), más el estado de
 * apertura de los paneles de Avisos y de Administración.
 */
export function AppPanelsProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [isAdmin, setIsAdmin] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState('');
  const [inboxOpen, setInboxOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const refreshNotifications = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, payload, created_at, read_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      setNotificationsError(error.message);
    } else {
      setNotificationsError('');
      setNotifications((data ?? []) as AppNotification[]);
    }
    setNotificationsLoading(false);
  }, [userId]);

  // Rol y estado de la cuenta (la base de datos es quien decide; esto solo
  // sirve para mostrar u ocultar los accesos).
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.all([supabase.rpc('is_admin'), supabase.rpc('is_suspended')]).then(
      ([adminResult, suspendedResult]) => {
        if (!active) return;
        setIsAdmin(adminResult.data === true);
        setSuspended(suspendedResult.data === true);
      },
    );
    return () => {
      active = false;
    };
  }, [userId]);

  // Carga inicial + avisos en vivo.
  useEffect(() => {
    if (!userId) return;
    void refreshNotifications();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => void refreshNotifications(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshNotifications]);

  const markRead = useCallback(
    async (id: string) => {
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => (item.id === id ? { ...item, read_at: readAt } : item)),
      );
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: readAt })
        .eq('id', id);
      if (error) {
        setNotificationsError(error.message);
        await refreshNotifications();
      }
    },
    [refreshNotifications],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => (item.read_at ? item : { ...item, read_at: readAt })),
    );
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) {
      setNotificationsError(error.message);
      await refreshNotifications();
    }
  }, [userId, refreshNotifications]);

  const removeNotification = useCallback(
    async (id: string) => {
      setNotifications((current) => current.filter((item) => item.id !== id));
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) {
        setNotificationsError(error.message);
        await refreshNotifications();
      }
    },
    [refreshNotifications],
  );

  const clearNotifications = useCallback(async () => {
    if (!userId) return;
    setNotifications([]);
    const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
    if (error) {
      setNotificationsError(error.message);
      await refreshNotifications();
    }
  }, [userId, refreshNotifications]);

  const value = useMemo<AppPanelsValue>(
    () => ({
      isAdmin,
      suspended,
      notifications,
      unreadCount: notifications.filter((item) => !item.read_at).length,
      notificationsLoading,
      notificationsError,
      refreshNotifications,
      markRead,
      markAllRead,
      removeNotification,
      clearNotifications,
      inboxOpen,
      openInbox: () => setInboxOpen(true),
      closeInbox: () => setInboxOpen(false),
      adminOpen,
      openAdmin: () => setAdminOpen(true),
      closeAdmin: () => setAdminOpen(false),
    }),
    [
      isAdmin,
      suspended,
      notifications,
      notificationsLoading,
      notificationsError,
      refreshNotifications,
      markRead,
      markAllRead,
      removeNotification,
      clearNotifications,
      inboxOpen,
      adminOpen,
    ],
  );

  return <AppPanelsContext.Provider value={value}>{children}</AppPanelsContext.Provider>;
}

export function useAppPanels() {
  const context = useContext(AppPanelsContext);
  if (!context) {
    throw new Error('useAppPanels must be used within an AppPanelsProvider.');
  }
  return context;
}
