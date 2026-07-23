import resources from '@logto/phrases';
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

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
    i18next.addResourceBundle(language, 'translation', values.translation, true);
    i18next.addResourceBundle(language, 'errors', values.errors, true);
  }
};

export default initI18n;
