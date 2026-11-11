import { Redirect, type Href } from 'expo-router';

import { AdminPanel } from '@/components/admin-panel';
import AppTabs from '@/components/app-tabs';
import { AssistantLauncher } from '@/components/assistant-launcher';
import { NotificationsPanel } from '@/components/notifications-panel';
import { SuspensionGate } from '@/components/suspension-gate';
import { AppPanelsProvider, useAppPanels } from '@/providers/app-panels-provider';
import { AssistantProvider } from '@/providers/assistant-provider';
import { useAuth } from '@/providers/auth-provider';

/**
 * NIVEL 1 · App. Solo con sesión. Las 5 pestañas principales (Inicio, Tablón,
 * Juegos, Chat, Perfil) son el único nivel de navegación; el detalle de cada
 * elemento y los paneles de Avisos y Administración se abren como ventanas
 * a pantalla completa encima de la pestaña actual.
 */
export default function AppLayout() {
  const { session, passwordRecovery } = useAuth();

  if (!session || passwordRecovery) {
    return <Redirect href={'/sign-in' as Href} />;
  }

  return (
    <AppPanelsProvider>
      <SuspensionGate>
        <AssistantProvider>
          <AppTabs />
          <AssistantLauncher />
        </AssistantProvider>
        <Panels />
      </SuspensionGate>
    </AppPanelsProvider>
  );
}

function Panels() {
  const { isAdmin } = useAppPanels();
  return (
    <>
      <NotificationsPanel />
      {isAdmin ? <AdminPanel /> : null}
    </>
  );
}
