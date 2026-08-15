import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createConfiguredWebAPIs } from './runtimeConfig';
import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';
import { initializeLocale, I18nProvider } from '@openchamber/ui/lib/i18n';
import { RuntimeAPIProvider } from '@openchamber/ui/contexts/RuntimeAPIProvider';
import { PetOverlay } from '@openchamber/ui/components/chat/pets/PetOverlay';
import '@openchamber/ui/index.css';
import '@openchamber/ui/styles/fonts';

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
  }
}

window.__OPENCHAMBER_RUNTIME_APIS__ = createConfiguredWebAPIs();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

initializeLocale();

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider>
      <RuntimeAPIProvider apis={window.__OPENCHAMBER_RUNTIME_APIS__ ?? createConfiguredWebAPIs()}>
        <PetOverlay />
      </RuntimeAPIProvider>
    </I18nProvider>
  </StrictMode>,
);
