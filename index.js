const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, AttachmentBuilder } = require('discord.js');

require('dotenv').config();

// Конфігураційні константи
const TOKEN = process.env.TOKEN; // Токен бота
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;   // ID адмін-каналу для готових заявок

// Створюємо клієнт Discord з потрібними правами (інтентами) для роботи з повідомленнями і DM
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // для роботи зі слеш-командами
        GatewayIntentBits.GuildMessages,    // для отримання повідомлень на сервері (напр., щоб ігнорувати або логувати)
        GatewayIntentBits.MessageContent,   // щоб читати зміст повідомлень (потрібно для тексту відповідей)
        GatewayIntentBits.DirectMessages    // щоб отримувати повідомлення в DM
    ],
    partials: [ Partials.Channel ]          // для обробки DM-каналу, який може приходити як partial
});

// Логування (console) з міткою часу
function logEvent(code, description) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${code}] ${description}`);
}

// Збереження активних сесій користувачів
const activeSessions = new Set();

// Колекція текстів двома мовами для зручності (ua = українська, en = English)
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
        askRules: "7️⃣ Чи приймаєте ви умови, що якщо перевищите свій ліміт і займете чужe місце, будуть штрафи та можливе обнулення акаунта? (Так/Ні)",
        askAltRank: "8️⃣ Якщо вам дадуть нижчий ранг, ніж ви хочете (наприклад, 10 місце) — вам усе одно цікаво брати участь у цьому MGE? (Так/Ні)",
        invalidImage: "❗ Будь ласка, надішліть **зображення** (скріншот) для цього питання.",
        invalidText: "❗ Будь ласка, надішліть відповідь текстом (це питання не потребує зображення).",
        timeoutMsg: "⚠️ Час на відповіді вичерпано. Сесію завершено. Якщо хочете спробувати знову – використайте команду /apply заново.",
        sessionActive: "Ви вже запустили заповнення анкети. Завершіть поточну або зачекайте 5 хвилин, щоб почати нову.",
        dmError: "Не вдалося надіслати вам приватне повідомлення. Можливо, у вас вимкнені DM з цього серверу.",
        thankYou: "✅ Дякуємо, вашу заявку отримано! Її відправлено адміністраторам."
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
        askRules: "7️⃣ Do you accept that if you exceed your limit and take someone else's spot, you will get penalties and possibly be zeroed? (Yes/No)",
        askAltRank: "8️⃣ If you're offered a lower rank than requested (e.g. rank 10), do you still want this MGE spot? (Yes/No)",
        invalidImage: "❗ Please send an **image** (screenshot) for this question.",
        invalidText: "❗ Please answer with text (no image is needed for this question).",
        timeoutMsg: "⚠️ Time is up. Session ended due to inactivity. Please run /apply again if you want to try again.",
        sessionActive: "You already have an application in progress. Please finish it or wait 5 minutes before starting a new one.",
        dmError: "I couldn't send you a DM. Please check your privacy settings and try again.",
        thankYou: "✅ Thank you, your application has been received and sent to the admins!"
    }
};

// Головна подія при запуску бота
client.once(Events.ClientReady, async () => {
    console.log(`Bot logged in as ${client.user.tag}`);

    const guildId = '1354546683643428864'; // твій сервер
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
        console.error(`Сервер із ID ${guildId} не знайдено!`);
        return;
    }

    // Очищення глобальних команд (опційно)
    await client.application.commands.fetch();

    // Отримуємо всі команди сервера
    const commands = await guild.commands.fetch();

    // Знаходимо команду apply
    const applyCommand = commands.find(cmd => cmd.name === 'apply');

    if (applyCommand) {
        try {
            await guild.commands.delete(applyCommand.id);
            console.log('✅ Команда /apply успішно видалена!');
        } catch (error) {
            console.error('❌ Помилка при видаленні команди /apply:', error);
        }
    } else {
        console.log('ℹ️ Команда /apply не знайдена на сервері.');
    }

    // Тепер реєструємо нову команду /mge
    try {
        await guild.commands.create({
            name: 'mge',
            description: 'Start an MGE application.'
        });
        console.log('✅ Slash-команда /mge успішно зареєстрована!');
    } catch (error) {
        console.error('❌ Помилка при реєстрації /mge:', error);
    }
});


// Обробка взаємодій (slash-команд)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'mge') {
        const userId = interaction.user.id;
        const allowedChannelId = '1354975609738104944'; // тут встав свій ID каналу

        if (interaction.channelId !== allowedChannelId) {
            await interaction.reply({ 
                content: `❌ This command can only be used in <#${allowedChannelId}> channel.`,
                ephemeral: true 
            });
            return; // Зупиняємо виконання
        }
        // Перевірка активної сесії для цього користувача
        if (activeSessions.has(userId)) {
            // Відповідаємо ephemeral, що сесія вже активна
            await interaction.reply({ content: localeTexts.en.sessionActive, ephemeral: true });
            return;
        }
        // Додаємо у активні сесії
        activeSessions.add(userId);
        logEvent("200", `Started MGE application session for user ${userId}`);
        await interaction.deferReply({ ephemeral: true });
        try {
            // Відправляємо користувачу DM з привітанням
            const dmChannel = await interaction.user.createDM();
            // Визначаємо мову: беремо налаштування Discord користувача, або за замовчуванням англ.
            let lang = 'en';
            const locale = interaction.locale || '';  // наприклад, 'uk' або 'en-US'
            if (locale.startsWith('uk')) {
                lang = 'ua';
            }
            // Якщо хочемо явно запитувати мову, можна раскоментувати наступний блок:
            
            //await dmChannel.send(localeTexts.en.chooseLang + "\n" + localeTexts.ua.chooseLang);
            //const langReply = await dmChannel.awaitMessages({
            //    filter: m => m.author.id === userId,
            //    max: 1,
            //    time: 30000
            //});
            //if (langReply.size) {
            //    const choice = langReply.first().content.trim();
            //    if (choice === '2' || choice === 'Українська' || choice.toLowerCase() === 'ukrainian') {
            //        lang = 'ua';
            //    } else {
            //        lang = 'en';
            //    }
            //}
            
            // Відправляємо стартове повідомлення і перше питання
            await interaction.editReply({ content: (lang === 'ua' ? "✅ Починаємо заповнення анкети! Повідомлення надіслано вам в приват." : "✅ Starting your application! I've sent you a DM.") });
            // Привітання в DM
            const introMsg = await dmChannel.send(localeTexts[lang].startDm);
            // Плануємо авто-видалення повідомлення бота через 5 хв (300000 мс)
            setTimeout(() => { introMsg.delete().catch(() => {}); }, 300000);

            // Функція-хелпер для отримання відповіді з DM з таймаутом і валідацією
            async function askQuestion(questionText, expectImage) {
                // Надсилаємо питання
                const questionMsg = await dmChannel.send(questionText);
                setTimeout(() => { questionMsg.delete().catch(() => {}); }, 300000);
                // Чекаємо на відповідь
                const reply = await dmChannel.awaitMessages({
                    filter: m => m.author.id === userId,
                    max: 1,
                    time: 300000
                });
                if (!reply.size) {
                    // Якщо час вийшов і відповіді нема
                    return null; // signal timeout
                }
                const answerMsg = reply.first();
                // Якщо бот отримав відповідь, далі перевіряємо тип
                if (expectImage) {
                    // Очікувався скріншот (вкладення)
                    if (answerMsg.attachments.size === 0) {
                        // Користувач не прикріпив файл
                        const warnMsg = await dmChannel.send(localeTexts[lang].invalidImage);
                        setTimeout(() => { warnMsg.delete().catch(() => {}); }, 300000);
                        // Видаляємо повідомлення користувача (без вкладення, не потрібно зберігати)
                        try { await answerMsg.delete(); } catch {}
                        // Повторно запитуємо те саме питання рекурсивно
                        return await askQuestion(questionText, expectImage);
                    } else {
                        // ОК - є вкладення. (Можна додатково перевірити, чи це зображення за contentType)
                        const attachment = answerMsg.attachments.first();
                        const isImage = attachment.contentType && attachment.contentType.startsWith('image');
                        if (!isImage) {
                            const warnMsg = await dmChannel.send(localeTexts[lang].invalidImage);
                            setTimeout(() => { warnMsg.delete().catch(() => {}); }, 300000);
                            try { await answerMsg.delete(); } catch {}
                            return await askQuestion(questionText, expectImage);
                        }
                        // Якщо все гаразд, залишаємо відповідь (можна також видалити одразу або пізніше).
                        // (Не видаляємо її зараз, бо нам потрібно attachment.url далі для Embed)
                        return answerMsg;
                    }
                } else {
                    // Очікувався текст
                    if (answerMsg.attachments.size > 0) {
                        // Якщо користувач надіслав картинку, а треба текст
                        const warnMsg = await dmChannel.send(localeTexts[lang].invalidText);
                        setTimeout(() => { warnMsg.delete().catch(() => {}); }, 300000);
                        try { await answerMsg.delete(); } catch {}
                        return await askQuestion(questionText, expectImage);
                    } else {
                        // Отримано текстову відповідь
                        return answerMsg;
                    }
                }
            }

            // Послідовно ставимо кожне питання і збираємо відповіді
            const answers = {};  // для збереження відповідей
            // 1. Профіль (скрін)
            let response = await askQuestion(localeTexts[lang].askProfile, true);
            if (!response) { throw { code: 101, message: "User did not respond to profile screenshot." }; }
            answers.profileScreenshot = response.attachments.first();
            // 2. Командир (скрін)
            response = await askQuestion(localeTexts[lang].askCommander, true);
            if (!response) { throw { code: 101, message: "User did not respond to commander screenshot." }; }
            answers.commanderScreenshot = response.attachments.first();
            // 3. Скріншот спорядження (нове)
            response = await askQuestion(localeTexts[lang].askEquipment, true);
            if (!response) { throw { code: 101, message: "User did not respond to equipment screenshot." }; }
            answers.equipmentScreenshot = response.attachments.first();
            // 4. Бажане місце (текст)
            response = await askQuestion(localeTexts[lang].askPlace, false);
            if (!response) { throw { code: 101, message: "User did not respond to desired place." }; }
            answers.place = response.content.trim();
            // 4. VIP (скрін)
            response = await askQuestion(localeTexts[lang].askVIP, true);
            if (!response) { throw { code: 101, message: "User did not respond to VIP screenshot." }; }
            answers.vipScreenshot = response.attachments.first();
            // 5. Кількість голів (текст/число)
            response = await askQuestion(localeTexts[lang].askHeads, false);
            if (!response) { throw { code: 101, message: "User did not respond to golden heads count." }; }
            answers.heads = response.content.trim();
            // 6. Чи зможе заекспертити (Yes/No)
            response = await askQuestion(localeTexts[lang].askExpertise, false);
            if (!response) { throw { code: 101, message: "User did not respond to expertise question." }; }
            answers.expertise = response.content.trim();
            // 7. Чи приймає правила (Yes/No)
            response = await askQuestion(localeTexts[lang].askRules, false);
            if (!response) { throw { code: 101, message: "User did not respond to rules acceptance." }; }
            answers.rules = response.content.trim();
            // 7. Якщо буде інше місце, це підійде? (Yes/No)
            response = await askQuestion(localeTexts[lang].askAltRank, false);
            if (!response) { throw { code: 101, message: "User did not respond to alternate rank question." }; }
            answers.altRank = response.content.trim();

            // Якщо всі відповіді зібрані успішно:
            logEvent("201", `Collected all answers from user ${userId}. Preparing embed...`);

            // Формуємо Embed з усією інформацією
            const embed = new EmbedBuilder()
                .setTitle(lang === 'ua' ? "🏅 Нова заявка MGE" : "🏅 New MGE Application")
                .setColor(0x2ECC71);  // зелений для успішної заявки (можна змінити)

            // Додаємо поля з відповідями (скріншоти як імена файлів, текстові як значення)
            // Складаємо імена файлів для вкладень
            const filesToAttach = [];
            // Функція для додавання файлу в список вкладень і текстового представлення в поле
            function addImageField(fieldName, attachment) {
                let fileName = attachment.name || "screenshot.png";
                // Додаємо файл у масив для відправки (AttachmentBuilder з URL файла)
                filesToAttach.push(new AttachmentBuilder(attachment.url, { name: fileName }));
                // Вказуємо в полі назву файлу як посилання на вкладення (attachment://fileName)
                embed.addFields({ name: fieldName, value: `📎 ${fileName}`, inline: false });
            }
            // Поля для скріншотів
            addImageField("Profile Screenshot", answers.profileScreenshot);
            addImageField("Commander Screenshot", answers.commanderScreenshot);
            addImageField("Equipment Screenshot", answers.equipmentScreenshot);
            addImageField("VIP Screenshot", answers.vipScreenshot);
            // Поля для текстових відповідей
            embed.addFields(
                { name: "Desired Rank", value: answers.place || "N/A", inline: true },
                { name: "Golden Heads", value: answers.heads || "N/A", inline: true },
                { name: "Can Expertise?", value: answers.expertise || "N/A", inline: true },
                { name: "Accepts Rules?", value: answers.rules || "N/A", inline: true },
                { name: "Wants MGE if given lower rank?", value: answers.altRank || "N/A", inline: true }
            );
            // Інформація про користувача
            //embed.addFields({ name: "User ID", value: interaction.user.id, inline: false });
            embed.setFooter({ text: `User: ${interaction.user.tag}` });

            // Надсилаємо Embed в адміністративний канал
            const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);
            await adminChannel.send({ embeds: [embed], files: filesToAttach });
            logEvent("202", `Sent application embed to admin channel for user ${userId}.`);

            // Повідомляємо користувачу про успішне завершення
            const thanksMsg = await dmChannel.send(localeTexts[lang].thankYou);
            setTimeout(() => { thanksMsg.delete().catch(() => {}); }, 300000);
        }
        catch (err) {
            // Обробка виключень і таймаутів
            if (err && err.code === 101) {
                // Таймаут (користувач не відповів вчасно)
                logEvent("101", `Session timed out for user ${userId} - ${err.message || 'No response'}`);
                try {
                    const timeoutNotice = await interaction.user.send(localeTexts.en.timeoutMsg);
                    setTimeout(() => { timeoutNotice.delete().catch(() => {}); }, 300000);
                } catch {}
            } else if (err && err.code === 102) {
                // Помилка надсилання в адмін-канал (можна кинути вручну або з catch)
                logEvent("102", `Failed to send embed to admin channel for user ${userId} - ${err.message || err}`);
                try {
                    await interaction.user.send(localeTexts.en.dmError);
                } catch {}
            } else if (err && err.message === "Cannot send messages to this user") {
                // Помилка надсилання DM (користувач відключив приватні повідомлення)
                logEvent("100", `Cannot DM user ${userId}. Possibly has DMs closed.`);
                await interaction.reply({ content: localeTexts.en.dmError, ephemeral: true });
            } else {
                // Непередбачена помилка
                console.error("Unexpected error in application flow:", err);
                logEvent("ERROR", `Unexpected error for user ${userId}: ${err.message || err}`);
                try {
                    await interaction.user.send("❌ An unexpected error occurred. Please contact an administrator.");
                } catch {}
            }
        }
        finally {
            // При будь-якому результаті завершуємо сесію
            activeSessions.delete(userId);
        }
    }
});

client.login(TOKEN);