// bot.js (discord.js v14, CommonJS)
// Admin uses /mgepanel to post a button panel.
// Users click the button => DM flow starts (no user commands).

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

// ===== ENV =====
const TOKEN = process.env.TOKEN;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;
const ALLOWED_PANEL_CHANNEL_ID = process.env.ALLOWED_PANEL_CHANNEL_ID; // where /mgepanel is allowed
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || null; // optional

if (!TOKEN || !ADMIN_CHANNEL_ID || !GUILD_ID || !ALLOWED_PANEL_CHANNEL_ID) {
  console.error(
    "❌ Missing env. Required: TOKEN, ADMIN_CHANNEL_ID, GUILD_ID, ALLOWED_PANEL_CHANNEL_ID"
  );
  process.exit(1);
}

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

// ===== Active sessions =====
const activeSessions = new Set(); // userId

// ===== Locale texts =====
const localeTexts = {
  ua: {
    startDm: "Привіт! Для подання заявки MGE, будь ласка, дайте відповіді на кілька запитань.",
    chooseLang: "Оберіть мову спілкування: напишіть `1` для English, або `2` для Українська.",
    askProfile: "1️⃣ Надішліть скріншот вашого профілю.",
    askCommander: "2️⃣ Надішліть скріншот командира, якого ви хочете (претендуєте отримати).",
    askEquipment: "3️⃣ Надішліть скріншот вашого спорядження.",
    askPlace: "4️⃣ Яке місце (ранг) у MGE ви хочете зайняти?",
    askVIP: "4️⃣ Який у вас VIP-рівень? Надішліть, будь ласка, скріншот VIP.",
    askHeads: "5️⃣ Скільки у вас зараз універсальних золотих голів (легендарних скульптур)?",
    askExpertise: "6️⃣ Чи зможете ви зробити цього командира експертом (максимально прокачати)? Відповідь Так/Ні.",
    askRules:
      "7️⃣ Чи приймаєте ви умови, що якщо перевищите свій ліміт і займете чужe місце, будуть штрафи та можливе обнулення акаунта? (Так/Ні)",
    askAltRank:
      "8️⃣ Якщо вам дадуть нижчий ранг, ніж ви хочете (наприклад, 10 місце) — вам усе одно цікаво брати участь у цьому MGE? (Так/Ні)",
    invalidImage: "❗ Будь ласка, надішліть **зображення** (скріншот) для цього питання.",
    invalidText: "❗ Будь ласка, надішліть відповідь текстом (це питання не потребує зображення).",
    timeoutMsg:
      "⚠️ Час на відповіді вичерпано. Сесію завершено. Якщо хочете спробувати знову — натисніть кнопку ще раз.",
    sessionActive:
      "Ви вже запустили заповнення анкети. Завершіть поточну або зачекайте 5 хвилин, щоб почати нову.",
    dmError:
      "Не вдалося надіслати вам приватне повідомлення. Можливо, у вас вимкнені DM з цього серверу.",
    thankYou: "✅ Дякуємо, вашу заявку отримано! Її відправлено адміністраторам.",
  },
  en: {
    startDm: "Hello! To apply for the MGE event, please answer a few questions.",
    chooseLang: "Please choose a language: type `1` for English, or `2` for Ukrainian.",
    askProfile: "1️⃣ Please send a screenshot of your game profile.",
    askCommander: "2️⃣ Please send a screenshot of the commander you want (the one you're applying for).",
    askEquipment: "3️⃣ Please send a screenshot of your equipment.",
    askPlace: "4️⃣ What rank/place do you want in the MGE event?",
    askVIP: "4️⃣ What is your VIP level? Please send a screenshot of your VIP screen.",
    askHeads: "5️⃣ How many universal **gold heads** (legendary sculptures) do you have right now?",
    askExpertise: "6️⃣ Will you be able to max **expertise** this commander? (Yes/No answer)",
    askRules:
      "7️⃣ Do you accept that if you exceed your limit and take someone else's spot, you will get penalties and possibly be zeroed? (Yes/No)",
    askAltRank:
      "8️⃣ If you're offered a lower rank than requested (e.g. rank 10), do you still want this MGE spot? (Yes/No)",
    invalidImage: "❗ Please send an **image** (screenshot) for this question.",
    invalidText: "❗ Please answer with text (no image is needed for this question).",
    timeoutMsg:
      "⚠️ Time is up. Session ended due to inactivity. Click the button again if you want to retry.",
    sessionActive:
      "You already have an application in progress. Please finish it or wait 5 minutes before starting a new one.",
    dmError: "I couldn't send you a DM. Please check your privacy settings and try again.",
    thankYou: "✅ Thank you, your application has been received and sent to the admins!",
  },
};

// ===== Panel UI =====
const PANEL_BUTTON_ID = "mge_apply_button_v1";

// ===== Register slash command(s) =====
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    console.error(`❌ Guild with ID ${GUILD_ID} not found. Check GUILD_ID.`);
    return;
  }

  // Register /mgepanel (admin-only by checks in handler)
  try {
    await guild.commands.create({
      name: "mgepanel",
      description: "Post the MGE application button panel (admin).",
    });
    console.log("✅ Slash command /mgepanel registered.");
  } catch (e) {
    console.error("❌ Failed to register /mgepanel:", e);
  }
});

// ===== Helpers =====
function isAdminAllowed(interaction) {
  // Option A: require Admin role if provided
  if (ADMIN_ROLE_ID) {
    const hasRole = interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID);
    return Boolean(hasRole);
  }

  // Option B: require ManageGuild or Administrator
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return (
    perms.has(PermissionsBitField.Flags.Administrator) ||
    perms.has(PermissionsBitField.Flags.ManageGuild)
  );
}

// ===== Core DM flow =====
async function runMgeFlow({ user, locale, replyEphemeral }) {
  const userId = user.id;

  if (activeSessions.has(userId)) {
    await replyEphemeral(localeTexts.en.sessionActive);
    return;
  }

  activeSessions.add(userId);
  logEvent("200", `Started MGE session for user ${userId}`);

  try {
    // Determine language
    let lang = "en";
    if ((locale || "").startsWith("uk")) lang = "ua";

    let dmChannel;
    try {
      dmChannel = await user.createDM();
    } catch {
      await replyEphemeral(localeTexts.en.dmError);
      return;
    }

    // Inform user in ephemeral reply that DM is sent
    await replyEphemeral(
      lang === "ua"
        ? "✅ Починаємо! Я надіслав вам повідомлення в приват."
        : "✅ Starting! I sent you a DM."
    );

    const introMsg = await dmChannel.send(localeTexts[lang].startDm);
    setTimeout(() => introMsg.delete().catch(() => {}), 300000);

    async function askQuestion(questionText, expectImage) {
      const questionMsg = await dmChannel.send(questionText);
      setTimeout(() => questionMsg.delete().catch(() => {}), 300000);

      const reply = await dmChannel.awaitMessages({
        filter: (m) => m.author.id === userId,
        max: 1,
        time: 300000,
      });

      if (!reply.size) return null;

      const answerMsg = reply.first();

      if (expectImage) {
        if (answerMsg.attachments.size === 0) {
          const warn = await dmChannel.send(localeTexts[lang].invalidImage);
          setTimeout(() => warn.delete().catch(() => {}), 300000);
          try {
            await answerMsg.delete();
          } catch {}
          return await askQuestion(questionText, expectImage);
        }

        const attachment = answerMsg.attachments.first();
        const isImage =
          (attachment.contentType && attachment.contentType.startsWith("image")) ||
          // fallback: some uploads may lack contentType
          /\.(png|jpe?g|webp|gif)$/i.test(attachment.name || "");

        if (!isImage) {
          const warn = await dmChannel.send(localeTexts[lang].invalidImage);
          setTimeout(() => warn.delete().catch(() => {}), 300000);
          try {
            await answerMsg.delete();
          } catch {}
          return await askQuestion(questionText, expectImage);
        }

        return answerMsg;
      }

      // expect text
      if (answerMsg.attachments.size > 0) {
        const warn = await dmChannel.send(localeTexts[lang].invalidText);
        setTimeout(() => warn.delete().catch(() => {}), 300000);
        try {
          await answerMsg.delete();
        } catch {}
        return await askQuestion(questionText, expectImage);
      }

      return answerMsg;
    }

    // Collect answers
    const answers = {};

    let response = await askQuestion(localeTexts[lang].askProfile, true);
    if (!response) throw { code: 101, message: "Timeout on profile screenshot." };
    answers.profileScreenshot = response.attachments.first();

    response = await askQuestion(localeTexts[lang].askCommander, true);
    if (!response) throw { code: 101, message: "Timeout on commander screenshot." };
    answers.commanderScreenshot = response.attachments.first();

    response = await askQuestion(localeTexts[lang].askEquipment, true);
    if (!response) throw { code: 101, message: "Timeout on equipment screenshot." };
    answers.equipmentScreenshot = response.attachments.first();

    response = await askQuestion(localeTexts[lang].askPlace, false);
    if (!response) throw { code: 101, message: "Timeout on desired place." };
    answers.place = response.content.trim();

    response = await askQuestion(localeTexts[lang].askVIP, true);
    if (!response) throw { code: 101, message: "Timeout on VIP screenshot." };
    answers.vipScreenshot = response.attachments.first();

    response = await askQuestion(localeTexts[lang].askHeads, false);
    if (!response) throw { code: 101, message: "Timeout on heads count." };
    answers.heads = response.content.trim();

    response = await askQuestion(localeTexts[lang].askExpertise, false);
    if (!response) throw { code: 101, message: "Timeout on expertise." };
    answers.expertise = response.content.trim();

    response = await askQuestion(localeTexts[lang].askRules, false);
    if (!response) throw { code: 101, message: "Timeout on rules." };
    answers.rules = response.content.trim();

    response = await askQuestion(localeTexts[lang].askAltRank, false);
    if (!response) throw { code: 101, message: "Timeout on alt rank." };
    answers.altRank = response.content.trim();

    // Build embed for admins
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

    embed.addFields(
      { name: "Desired Rank", value: answers.place || "N/A", inline: true },
      { name: "Golden Heads", value: answers.heads || "N/A", inline: true },
      { name: "Can Expertise?", value: answers.expertise || "N/A", inline: true },
      { name: "Accepts Rules?", value: answers.rules || "N/A", inline: true },
      { name: "Wants if lower rank?", value: answers.altRank || "N/A", inline: true }
    );

    // Send to admin channel
    const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!adminChannel) throw { code: 102, message: "Admin channel not found/fetch failed." };

    await adminChannel.send({ embeds: [embed], files: filesToAttach });
    logEvent("202", `Sent application embed to admin channel for user ${userId}.`);

    const thanks = await dmChannel.send(localeTexts[lang].thankYou);
    setTimeout(() => thanks.delete().catch(() => {}), 300000);
  } catch (err) {
    if (err && err.code === 101) {
      logEvent("101", `Session timed out for user ${userId} - ${err.message || "No response"}`);
      try {
        const dm = await user.send(localeTexts.en.timeoutMsg);
        setTimeout(() => dm.delete().catch(() => {}), 300000);
      } catch {}
    } else if (err && err.code === 102) {
      logEvent("102", `Failed to send embed for user ${userId} - ${err.message || err}`);
      try {
        await user.send(localeTexts.en.dmError);
      } catch {}
    } else if (err && err.message === "Cannot send messages to this user") {
      logEvent("100", `Cannot DM user ${userId}. Possibly has DMs closed.`);
      // nothing else we can do reliably here
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

// ===== Interactions =====
client.on(Events.InteractionCreate, async (interaction) => {
  // --- Admin command: /mgepanel ---
  if (interaction.isChatInputCommand() && interaction.commandName === "mgepanel") {
    // channel restriction
    if (interaction.channelId !== ALLOWED_PANEL_CHANNEL_ID) {
      await interaction.reply({
        content: `❌ Use this command only in <#${ALLOWED_PANEL_CHANNEL_ID}>.`,
        ephemeral: true,
      });
      return;
    }

    // permission restriction
    if (!isAdminAllowed(interaction)) {
      await interaction.reply({ content: "❌ No permission.", ephemeral: true });
      return;
    }

    const panelEmbed = new EmbedBuilder()
      .setTitle("🏅 MGE Application")
      .setDescription(
        "Click the button below to start your application.\n\n" +
          "Натисніть кнопку нижче, щоб почати заявку."
      )
      .setColor(0x5865f2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(PANEL_BUTTON_ID)
        .setLabel("Start MGE application")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ content: "✅ Panel posted.", ephemeral: true });
    await interaction.channel.send({ embeds: [panelEmbed], components: [row] });
    return;
  }

  // --- Button click: start flow ---
  if (interaction.isButton() && interaction.customId === PANEL_BUTTON_ID) {
    // Always ephemeral acknowledge quickly
    await interaction.deferReply({ ephemeral: true });

    await runMgeFlow({
      user: interaction.user,
      locale: interaction.locale,
      replyEphemeral: async (text) => {
        // If already deferred, we editReply; otherwise reply.
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
