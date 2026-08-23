const UKRAINIAN_SURVEY_LOCALES = ["uk", "ru"];

function getSurveyLanguage(locale) {
  const discordLocale = locale || "";
  const usesUkrainianSurvey = UKRAINIAN_SURVEY_LOCALES.some((code) =>
    discordLocale.startsWith(code)
  );

  return usesUkrainianSurvey ? "ua" : "en";
}

module.exports = { getSurveyLanguage };
