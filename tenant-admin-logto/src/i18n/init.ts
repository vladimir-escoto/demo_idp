import resources from '@logto/phrases';
import deepmerge from 'deepmerge';
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

/** Portal-specific keys layered on top of the console phrases. */
const overlays: Record<string, Record<string, unknown>> = {
  en: { admin_console: { tabs: { members: 'Members', org_settings: 'Settings' } } },
  es: { admin_console: { tabs: { members: 'Miembros', org_settings: 'Configuración' } } },
};

/** Same init as the Logto console, minus the experience namespace. */
const initI18n = async () => {
  if (i18next.isInitialized) {
    return;
  }

  await i18next
    .use(initReactI18next)
    .use(LanguageDetector)
    .init({
      resources: {},
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      detection: {
        lookupLocalStorage: 'i18nextTenantAdminLng',
        lookupSessionStorage: 'i18nextTenantAdminLng',
      },
    });

  for (const [language, values] of Object.entries(resources)) {
    // Phrases objects are frozen; deepmerge produces fresh mutable copies.
    const overlay = overlays[language];
    const translation = overlay
      ? deepmerge(values.translation as Record<string, unknown>, overlay)
      : values.translation;
    i18next.addResourceBundle(language, 'translation', translation, true);
    i18next.addResourceBundle(language, 'errors', values.errors, true);
  }
};

export default initI18n;
