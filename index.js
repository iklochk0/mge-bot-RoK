// bot.js (discord.js v14, CommonJS)
// Admin posts ONE panel in ONE channel with /mgepanel.
// Users click button -> DM flow starts.
// Cooldown: user can start only once per 5 minutes (and cannot run parallel sessions).
// Added:
//  - Per-step timeout codes (101..114) + admin timeout embed.
//  - Conditional questions:
//      * Crystal Academy spend? If yes -> ask details.
//      * Rank: if TOP-10 (<=10) -> ask "why deserve".
//      * Pair: if yes -> ask screenshot of pair commander SKILLS.
//  - Panel is edited if already exists (no spam).
//  - FIX: /mgepanel uses deferReply + editReply to avoid "Program not responding".

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require("discord.js");

require("dotenv").config();

const { getSurveyLanguage } = require("./survey-language");

// ===== ENV =====
const TOKEN = process.env.TOKEN;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const ALLOWED_PANEL_CHANNEL_ID = process.env.ALLOWED_PANEL_CHANNEL_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || null;

if (!TOKEN || !ADMIN_CHANNEL_ID || !ALLOWED_PANEL_CHANNEL_ID) {
  console.error(
    "❌ Missing env. Required: TOKEN, ADMIN_CHANNEL_ID, ALLOWED_PANEL_CHANNEL_ID"
  );
  process.exit(1);
}

// ===== SETTINGS =====
const PANEL_BUTTON_ID = "mge_apply_button_v1";
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const QUESTION_TTL_MS = 5 * 60 * 1000; // auto delete bot messages after 5 minutes
const TIMEOUT_MS = 5 * 60 * 1000; // wait for each answer up to 5 minutes

// ===== TIMEOUT CODES =====
const TIMEOUT_CODES = {
  PROFILE: 101,
  COMMANDER: 102,
  EQUIPMENT: 103,
  PLACE: 104,
  HIGH_RANK_WHY: 105,
  VIP: 106,
  CRYSTAL_DONATE: 107,
  CRYSTAL_SPEND: 108,
  HEADS: 109,
  EXPERTISE: 110,
  HAS_PAIR: 111,
  PAIR_SKILLS: 112,
  RULES: 113,
  ALTRANK: 114,
};

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// ===== Logging =====
function logEvent(code, description) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${code}] ${description}`);
}

// ===== State =====
const activeSessions = new Set(); // userId
const cooldownUntil = new Map(); // userId -> timestamp(ms)

// ===== Locale texts =====
const localeTexts = {
  ua: {
    startDm:
      "Привіт! Для подання заявки MGE, будь ласка, дайте відповіді на кілька запитань.",
    askProfile: "1️⃣ Надішліть скріншот вашого профілю.",
    askCommander:
      "2️⃣ Надішліть скріншот командира, якого ви хочете (претендуєте отримати).",
    askEquipment: "3️⃣ Надішліть скріншот вашого спорядження.",
    askPlace: "4️⃣ Яке місце (ранг) у MGE ви хочете зайняти?",
    askHighRankWhy:
      "📌 Ви хочете місце в ТОП-10 (1–10). Напишіть коротко: чому саме це місце і чому ви його заслуговуєте?",
    askVIP: "5️⃣ Який у вас VIP-рівень? Надішліть, будь ласка, скріншот VIP.",
    askCrystalDonate: "❄️ Донатите в Кристальну академію під KvK? (Так/Ні)",
    askCrystalSpend:
      "❄️ Скільки витрачаєте і на що саме? (наприклад: $5 supply / Crystal Path / Mountain Warfare / F2P тощо)",
    askHeads:
      "6️⃣ Скільки у вас зараз універсальних золотих голів (легендарних скульптур)?",
    askExpertise:
      "7️⃣ Чи зможете ви зробити цього командира експертом (максимально прокачати)? Відповідь Так/Ні.",
    askHasPair:
      "🤝 Чи є у вас пара (другий командир, з яким будете використовувати)? (Так/Ні)",
    askPairSkills:
      "🤝 Надішліть скріншот **навичок (Skills)** командира-пари, з яким будете використовувати.",
    askRules:
      "8️⃣ Чи приймаєте ви умови, що якщо перевищите свій ліміт і займете чуже місце, будуть штрафи та можливе обнулення акаунта? (Так/Ні)",
    askAltRank:
      "9️⃣ Якщо вам дадуть нижчий ранг, ніж ви хочете (наприклад, 11 місце) — вам усе одно цікаво брати участь у цьому MGE? (Так/Ні)",
    invalidImage:
      "❗ Будь ласка, надішліть **зображення** (скріншот) для цього питання.",
    invalidText:
      "❗ Будь ласка, надішліть відповідь текстом (це питання не потребує зображення).",
    timeoutMsg:
      "⚠️ Час на відповіді вичерпано. Сесію завершено. Натисніть кнопку ще раз, якщо хочете спробувати знову.",
    sessionActive:
      "У вас уже є активна заявка. Завершіть її або зачекайте, поки вона завершиться.",
    cooldownMsg: (mins) =>
      `⏳ Ви вже запускали заявку. Спробуйте знову через ~${mins} хв.`,
    dmError:
      "Не вдалося надіслати вам приватне повідомлення. Можливо, у вас вимкнені DM з цього серверу.",
    thankYou: "✅ Дякуємо, вашу заявку отримано! Її відправлено адміністраторам.",
  },
  en: {
    startDm: "Hello! To apply for the MGE event, please answer a few questions.",
    askProfile: "1️⃣ Please send a screenshot of your game profile.",
    askCommander:
      "2️⃣ Please send a screenshot of the commander you want (the one you're applying for).",
    askEquipment: "3️⃣ Please send a screenshot of your equipment.",
    askPlace: "4️⃣ What rank/place do you want in the MGE event?",
    askHighRankWhy:
      "📌 You want a TOP-10 rank (1–10). Briefly explain: why this rank and why you deserve it?",
    askVIP: "5️⃣ What is your VIP level? Please send a screenshot of your VIP screen.",
    askCrystalDonate: "❄️ Do you spend on the Crystal Academy for KvK? (Yes/No)",
    askCrystalSpend:
      "❄️ How much do you spend and on what exactly? (e.g. $5 supply / Crystal Path / Mountain Warfare / F2P, etc.)",
    askHeads:
      "6️⃣ How many universal **gold heads** (legendary sculptures) do you have right now?",
    askExpertise:
      "7️⃣ Will you be able to max **expertise** this commander? (Yes/No answer)",
    askHasPair:
      "🤝 Do you have a pair (2nd commander you will use together)? (Yes/No)",
    askPairSkills:
      "🤝 Please send a screenshot of the **skills (Skills screen)** of your pair commander.",
    askRules:
      "8️⃣ Do you accept that if you exceed your limit and take someone else's spot, you will get penalties and possibly be zeroed? (Yes/No)",
    askAltRank:
      "9️⃣ If you're offered a lower rank than requested (e.g. rank 11) — do you still want this MGE spot? (Yes/No)",
    invalidImage: "❗ Please send an **image** (screenshot) for this question.",
    invalidText: "❗ Please answer with text (no image is needed for this question).",
    timeoutMsg:
      "⚠️ Time is up. Session ended due to inactivity. Click the button again if you want to retry.",
    sessionActive:
      "You already have an application in progress. Please finish it first.",
    cooldownMsg: (mins) =>
      `⏳ You already started an application recently. Try again in ~${mins} min.`,
    dmError: "I couldn't send you a DM. Please check your privacy settings and try again.",
    thankYou: "✅ Thank you, your application has been received and sent to the admins!",
  },
};

// ===== Helpers =====
function isAdminAllowed(interaction) {
  if (ADMIN_ROLE_ID) {
    return Boolean(interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID));
  }
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return (
    perms.has(PermissionsBitField.Flags.Administrator) ||
    perms.has(PermissionsBitField.Flags.ManageGuild)
  );
}

function buildPanelMessage() {
  const panelEmbed = new EmbedBuilder()
    .setTitle("🏅 MGE Application")
    .setDescription(
      [
        "Click the button below to apply. The bot will DM you and ask a few questions."
      ].join("\n")
    )
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PANEL_BUTTON_ID)
      .setLabel("Start MGE application")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [panelEmbed], components: [row] };
}

async function findExistingPanelMessage(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return null;

  for (const msg of msgs.values()) {
    if (msg.author?.id !== client.user.id) continue;
    const comps = msg.components || [];
    const hasButton = comps.some((row) =>
      row.components?.some((c) => c.customId === PANEL_BUTTON_ID)
    );
    if (hasButton) return msg;
  }
  return null;
}

function makeTimeoutError(code, stepLabel) {
  return {
    code,
    type: "TIMEOUT",
    stepLabel,
    message: `Timeout at step: ${stepLabel}`,
  };
}

function normalizeYesNo(text) {
  const t = String(text || "").trim().toLowerCase();
  if (["так", "да", "y", "yes", "true", "1"].includes(t)) return true;
  if (["ні", "нет", "no", "n", "false", "0"].includes(t)) return false;
  return null;
}

function extractFirstInt(text) {
  const m = String(text || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// ===== Core DM flow =====
async function runMgeFlow({ user, locale, replyEphemeral }) {
  const userId = user.id;

  const lang = getSurveyLanguage(locale);

  // active session block
  if (activeSessions.has(userId)) {
    await replyEphemeral(localeTexts[lang].sessionActive);
    return;
  }

  // cooldown block
  const now = Date.now();
  const until = cooldownUntil.get(userId) || 0;
  if (until > now) {
    const mins = Math.ceil((until - now) / 60000);
    await replyEphemeral(localeTexts[lang].cooldownMsg(mins));
    return;
  }

  activeSessions.add(userId);
  cooldownUntil.set(userId, now + COOLDOWN_MS);

  logEvent("200", `Started MGE session for user ${userId}`);

  let dmChannel;

  try {
    try {
      dmChannel = await user.createDM();
    } catch {
      await replyEphemeral(localeTexts[lang].dmError);
      return;
    }

    await replyEphemeral(
      lang === "ua"
        ? "✅ Починаємо! Я надіслав вам DM."
        : "✅ Starting! I sent you a DM."
    );

    const introMsg = await dmChannel.send(localeTexts[lang].startDm);
    setTimeout(() => introMsg.delete().catch(() => {}), QUESTION_TTL_MS);

    async function askQuestion(questionText, expectImage) {
      const questionMsg = await dmChannel.send(questionText);
      setTimeout(() => questionMsg.delete().catch(() => {}), QUESTION_TTL_MS);

      const reply = await dmChannel.awaitMessages({
        filter: (m) => m.author.id === userId,
        max: 1,
        time: TIMEOUT_MS,
      });

      if (!reply.size) return null;

      const answerMsg = reply.first();

      if (expectImage) {
        if (answerMsg.attachments.size === 0) {
          const warn = await dmChannel.send(localeTexts[lang].invalidImage);
          setTimeout(() => warn.delete().catch(() => {}), QUESTION_TTL_MS);
          try { await answerMsg.delete(); } catch {}
          return await askQuestion(questionText, expectImage);
        }

        const attachment = answerMsg.attachments.first();
        const isImage =
          (attachment.contentType && attachment.contentType.startsWith("image")) ||
          /\.(png|jpe?g|webp|gif)$/i.test(attachment.name || "");

        if (!isImage) {
          const warn = await dmChannel.send(localeTexts[lang].invalidImage);
          setTimeout(() => warn.delete().catch(() => {}), QUESTION_TTL_MS);
          try { await answerMsg.delete(); } catch {}
          return await askQuestion(questionText, expectImage);
        }

        return answerMsg;
      }

      // expect text
      if (answerMsg.attachments.size > 0) {
        const warn = await dmChannel.send(localeTexts[lang].invalidText);
        setTimeout(() => warn.delete().catch(() => {}), QUESTION_TTL_MS);
        try { await answerMsg.delete(); } catch {}
        return await askQuestion(questionText, expectImage);
      }

      return answerMsg;
    }

    // ===== Collect answers (with branching) =====
    const answers = {};

    let response = await askQuestion(localeTexts[lang].askProfile, true);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.PROFILE, "askProfile");
    answers.profileScreenshot = response.attachments.first();

    response = await askQuestion(localeTexts[lang].askCommander, true);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.COMMANDER, "askCommander");
    answers.commanderScreenshot = response.attachments.first();

    response = await askQuestion(localeTexts[lang].askEquipment, true);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.EQUIPMENT, "askEquipment");
    answers.equipmentScreenshot = response.attachments.first();

    response = await askQuestion(localeTexts[lang].askPlace, false);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.PLACE, "askPlace");
    answers.place = response.content.trim();

    // Rank rule: TOP-10 (<=10) => ask why deserve
    {
      const rankNum = extractFirstInt(answers.place);
      const needsWhy = rankNum === null ? true : rankNum <= 10;
      if (needsWhy) {
        response = await askQuestion(localeTexts[lang].askHighRankWhy, false);
        if (!response) throw makeTimeoutError(TIMEOUT_CODES.HIGH_RANK_WHY, "askHighRankWhy");
        answers.highRankWhy = response.content.trim();
      }
    }

    response = await askQuestion(localeTexts[lang].askVIP, true);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.VIP, "askVIP");
    answers.vipScreenshot = response.attachments.first();

    // Crystal Academy: yes/no -> if yes ask details
    response = await askQuestion(localeTexts[lang].askCrystalDonate, false);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.CRYSTAL_DONATE, "askCrystalDonate");
    answers.crystalDonateRaw = response.content.trim();

    {
      const yn = normalizeYesNo(answers.crystalDonateRaw);
      const donates = yn === null ? true : yn; // if unclear -> treat as YES to force detail
      answers.crystalDonates = donates;

      if (donates) {
        response = await askQuestion(localeTexts[lang].askCrystalSpend, false);
        if (!response) throw makeTimeoutError(TIMEOUT_CODES.CRYSTAL_SPEND, "askCrystalSpend");
        answers.crystalSpend = response.content.trim();
      }
    }

    response = await askQuestion(localeTexts[lang].askHeads, false);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.HEADS, "askHeads");
    answers.heads = response.content.trim();

    response = await askQuestion(localeTexts[lang].askExpertise, false);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.EXPERTISE, "askExpertise");
    answers.expertise = response.content.trim();

    // Pair: yes/no -> if yes ask skills screenshot
    response = await askQuestion(localeTexts[lang].askHasPair, false);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.HAS_PAIR, "askHasPair");
    answers.hasPairRaw = response.content.trim();

    {
      const yn = normalizeYesNo(answers.hasPairRaw);
      const hasPair = yn === null ? false : yn; // if unclear -> treat as NO to avoid extra friction
      answers.hasPair = hasPair;

      if (hasPair) {
        response = await askQuestion(localeTexts[lang].askPairSkills, true);
        if (!response) throw makeTimeoutError(TIMEOUT_CODES.PAIR_SKILLS, "askPairSkills");
        answers.pairSkillsScreenshot = response.attachments.first();
      }
    }

    response = await askQuestion(localeTexts[lang].askRules, false);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.RULES, "askRules");
    answers.rules = response.content.trim();

    response = await askQuestion(localeTexts[lang].askAltRank, false);
    if (!response) throw makeTimeoutError(TIMEOUT_CODES.ALTRANK, "askAltRank");
    answers.altRank = response.content.trim();

    // ===== Build embed for admins =====
    logEvent("201", `Collected all answers from user ${userId}. Preparing embed...`);

    const embed = new EmbedBuilder()
      .setTitle(lang === "ua" ? "🏅 Нова заявка MGE" : "🏅 New MGE Application")
      .setColor(0x2ecc71)
      .setFooter({ text: `User: ${user.tag} | ID: ${user.id}` });

    const filesToAttach = [];

    function addImageField(fieldName, attachment) {
      const fileName = attachment.name || "screenshot.png";
      filesToAttach.push(new AttachmentBuilder(attachment.url, { name: fileName }));
      embed.addFields({ name: fieldName, value: `📎 ${fileName}`, inline: false });
    }

    addImageField("Profile Screenshot", answers.profileScreenshot);
    addImageField("Commander Screenshot", answers.commanderScreenshot);
    addImageField("Equipment Screenshot", answers.equipmentScreenshot);
    addImageField("VIP Screenshot", answers.vipScreenshot);

    if (answers.pairSkillsScreenshot) {
      addImageField("Pair Commander Skills Screenshot", answers.pairSkillsScreenshot);
    }

    embed.addFields(
      { name: "Desired Rank", value: answers.place || "N/A", inline: true },
      { name: "Golden Heads", value: answers.heads || "N/A", inline: true },
      { name: "Can Expertise?", value: answers.expertise || "N/A", inline: true },
      { name: "Accepts Rules?", value: answers.rules || "N/A", inline: true },
      { name: "Wants if lower rank?", value: answers.altRank || "N/A", inline: true },
      { name: "Crystal Academy Spend?", value: answers.crystalDonates ? "Yes" : "No", inline: true },
      { name: "Has Pair?", value: answers.hasPair ? "Yes" : "No", inline: true }
    );

    if (answers.crystalDonates) {
      embed.addFields({
        name: "Crystal Spend Details",
        value: answers.crystalSpend || "N/A",
        inline: false,
      });
    }

    if (answers.highRankWhy) {
      embed.addFields({ name: "Why TOP-10?", value: answers.highRankWhy, inline: false });
    }

    const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!adminChannel) throw { code: 900, message: "Admin channel not found/fetch failed." };

    await adminChannel.send({ embeds: [embed], files: filesToAttach });
    logEvent("202", `Sent application embed to admin channel for user ${userId}.`);

    const thanks = await dmChannel.send(localeTexts[lang].thankYou);
    setTimeout(() => thanks.delete().catch(() => {}), QUESTION_TTL_MS);
  } catch (err) {
    if (err && err.type === "TIMEOUT") {
      logEvent(String(err.code), `Session timed out for user ${userId} at ${err.stepLabel}`);

      // Notify admin where user timed out
      try {
        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
        if (adminChannel) {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle("⏳ MGE application timeout")
            .setColor(0xe67e22)
            .addFields(
              { name: "User", value: `${user.tag} (${user.id})`, inline: false },
              { name: "Step", value: err.stepLabel, inline: true },
              { name: "Code", value: String(err.code), inline: true }
            );
          await adminChannel.send({ embeds: [timeoutEmbed] });
        }
      } catch {}

      try {
        await user.send(localeTexts[lang].timeoutMsg);
      } catch {}
    } else if (err && err.code === 900) {
      logEvent("900", `Failed to send embed for user ${userId} - ${err.message || err}`);
      try {
        await user.send(localeTexts[lang].dmError);
      } catch {}
    } else if (err && err.message === "Cannot send messages to this user") {
      logEvent("100", `Cannot DM user ${userId}. Possibly has DMs closed.`);
    } else {
      console.error("Unexpected error in MGE flow:", err);
      logEvent("ERROR", `Unexpected error for user ${userId}: ${err?.message || err}`);
      try {
        await user.send("❌ An unexpected error occurred. Please contact an administrator.");
      } catch {}
    }
  } finally {
    activeSessions.delete(userId);
  }
}

// ===== Ready: register /mgepanel in the guild of the allowed channel =====
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  const panelChannel = await client.channels.fetch(ALLOWED_PANEL_CHANNEL_ID).catch(() => null);
  if (!panelChannel || !panelChannel.guild) {
    console.error("❌ ALLOWED_PANEL_CHANNEL_ID is invalid or not a guild text channel.");
    return;
  }

  const guild = panelChannel.guild;

  try {
    await guild.commands.create({
      name: "mgepanel",
      description: "Post/refresh the MGE application panel (admin).",
    });
    console.log(`✅ /mgepanel registered in guild: ${guild.name}`);
  } catch (e) {
    console.error("❌ Failed to register /mgepanel:", e);
  }
});

// ===== Interactions =====
client.on(Events.InteractionCreate, async (interaction) => {
  // Admin command: /mgepanel
  if (interaction.isChatInputCommand() && interaction.commandName === "mgepanel") {
    // IMPORTANT: respond within 3 seconds
    await interaction.deferReply({ ephemeral: true });

    if (interaction.channelId !== ALLOWED_PANEL_CHANNEL_ID) {
      await interaction.editReply(`❌ Use this command only in <#${ALLOWED_PANEL_CHANNEL_ID}>.`);
      return;
    }

    if (!isAdminAllowed(interaction)) {
      await interaction.editReply("❌ No permission.");
      return;
    }

    const channel = interaction.channel;
    const payload = buildPanelMessage();

    const existing = await findExistingPanelMessage(channel);
    if (existing) {
      await existing.edit(payload).catch(() => {});
      await interaction.editReply("✅ Panel refreshed (edited).");
      return;
    }

    await channel.send(payload);
    await interaction.editReply("✅ Panel posted.");
    return;
  }

  // Button click: start flow
  if (interaction.isButton() && interaction.customId === PANEL_BUTTON_ID) {
    await interaction.deferReply({ ephemeral: true });

    await runMgeFlow({
      user: interaction.user,
      locale: interaction.locale,
      replyEphemeral: async (text) => {
        try {
          await interaction.editReply({ content: text });
        } catch {
          try {
            await interaction.reply({ content: text, ephemeral: true });
          } catch {}
        }
      },
    });

    return;
  }
});

client.login(TOKEN);
