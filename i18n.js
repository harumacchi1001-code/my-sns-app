import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ja from "./locales/ja.json";

const resources = {
  ja: { translation: ja },
  en: { translation: en },
};

const deviceLanguage = Localization.getLocales()[0]?.languageCode || "en";
const supportedLanguage = ["ja", "en"].includes(deviceLanguage) ? deviceLanguage : "en";

i18n.use(initReactI18next).init({
  resources,
  lng: supportedLanguage,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;