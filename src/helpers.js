const EMBED_FIELD_VALUE_LIMIT = 1024;

function resolveLanguage(locale) {
  const discordLocale = String(locale || "").toLowerCase();
  return discordLocale.startsWith("uk") || discordLocale.startsWith("ru")
    ? "ua"
    : "en";
}

function normalizeYesNo(text) {
  const value = String(text || "").trim().toLowerCase();
  if (["так", "да", "y", "yes", "true", "1"].includes(value)) return true;
  if (["ні", "нет", "no", "n", "false", "0"].includes(value)) return false;
  return null;
}

function extractFirstInt(text) {
  const match = String(text || "").match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function limitEmbedValue(value, fallback = "N/A") {
  const text = String(value || fallback);
  if (text.length <= EMBED_FIELD_VALUE_LIMIT) return text;
  return `${text.slice(0, EMBED_FIELD_VALUE_LIMIT - 1)}…`;
}

function isCannotSendDmError(err) {
  if (!err) return false;

  if (err.code === 50007 || err.rawError?.code === 50007) return true;

  const message = String(err.message || err.rawError?.message || "").toLowerCase();
  return (
    message.includes("cannot send messages to this user") ||
    message.includes("no mutual guild")
  );
}

module.exports = {
  extractFirstInt,
  isCannotSendDmError,
  limitEmbedValue,
  normalizeYesNo,
  resolveLanguage,
};
