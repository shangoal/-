// ...[no changes in imports]...

const app = express();
const port = process.env.PORT || 8000;

const prefix = '.';
const ownerNumber = ['94764527598'];
const credsPath = path.resolve(__dirname, 'auth_info_baileys', 'creds.json'); // Use path.resolve

async function ensureSessionFile() {
  if (!fs.existsSync(credsPath)) {
    if (!config.SESSION_ID || typeof config.SESSION_ID !== 'string') {
      console.error('❌ SESSION_ID env variable is missing or invalid. Cannot restore session.');
      process.exit(1);
    }

    console.log("🔄 FlexMusic | 🎧🌎 creds.json not found. Downloading session from MEGA...");

    try {
      const sessdata = config.SESSION_ID;
      const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);
      const data = await new Promise((resolve, reject) => {
        filer.download((err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      fs.mkdirSync(path.dirname(credsPath), { recursive: true }); // Use path.dirname
      fs.writeFileSync(credsPath, data);
      console.log("✅ FlexMusic | 🎧🌎 Session downloaded and saved. Restarting bot...");
      setTimeout(() => {
        connectToWA();
      }, 2000);
    } catch (err) {
      console.error("❌ FlexMusic | 🎧🌎 Failed to download session file from MEGA:", err);
      process.exit(1);
    }
  } else {
    setTimeout(() => {
      connectToWA();
    }, 1000);
  }
}

async function connectToWA() {
  try {
    console.log("Connecting FlexMusic | 🎧🌎 🧬...");
    const { state, saveCreds } = await useMultiFileAuthState(path.dirname(credsPath));
    const { version } = await fetchLatestBaileysVersion();

    const FlexMusic = makeWASocket({
      logger: P({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Firefox"),
      auth: state,
      version,
      syncFullHistory: true,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
    });

    FlexMusic.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          connectToWA();
        }
      } else if (connection === 'open') {
        console.log('✅ FlexMusic | 🎧🌎 connected to WhatsApp');
        const up = `FlexMusic | 🎧🌎 connected ✅\n\nPREFIX: ${prefix}`;
        await FlexMusic.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
          image: { url: `https://github.com/shangoal/-/blob/main/images/flex%20Music.jpg?raw=true` },
          caption: up
        });

        // Load plugins safely
        fs.readdirSync("./plugins/").forEach((plugin) => {
          if (path.extname(plugin).toLowerCase() === ".js") {
            try {
              require(`./plugins/${plugin}`);
            } catch (err) {
              console.error(`Failed to load plugin ${plugin}:`, err);
            }
          }
        });
      }
    });

    FlexMusic.ev.on('creds.update', saveCreds);

    FlexMusic.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.messageStubType === 68) {
          await FlexMusic.sendMessageAck(msg.key);
        }
      }

      const mek = messages[0];
      if (!mek || !mek.message) return;

      mek.message = getContentType(mek.message) === 'ephemeralMessage' ? mek.message.ephemeralMessage.message : mek.message;
      if (mek.key.remoteJid === 'status@broadcast') return;

      const m = sms(FlexMusic, mek);
      const type = getContentType(mek.message);
      const from = mek.key.remoteJid;
      const body = type === 'conversation' ? mek.message.conversation : mek.message[type]?.text || mek.message[type]?.caption || '';
      const isCmd = body.startsWith(prefix);
      const commandName = isCmd ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase() : '';
      const args = body.trim().split(/ +/).slice(1);
      const q = args.join(' ');

      const sender = mek.key.fromMe ? (FlexMusic.user && FlexMusic.user.id) : (mek.key.participant || mek.key.remoteJid);
      const senderNumber = sender && sender.split('@')[0];
      const isGroup = from.endsWith('@g.us');
      const botNumber = FlexMusic.user && FlexMusic.user.id.split(':')[0];
      const pushname = mek.pushName || 'Sin Nombre';
      const isMe = botNumber && senderNumber && botNumber.includes(senderNumber);
      const isOwner = ownerNumber.includes(senderNumber) || isMe;
      const botNumber2 = FlexMusic.user ? await jidNormalizedUser(FlexMusic.user.id) : '';

      const groupMetadata = isGroup ? await FlexMusic.groupMetadata(from).catch(() => {}) : '';
      const groupName = isGroup && groupMetadata ? groupMetadata.subject : '';
      const participants = isGroup && groupMetadata ? groupMetadata.participants : '';
      const groupAdmins = isGroup && participants ? await getGroupAdmins(participants) : '';
      const isBotAdmins = isGroup && groupAdmins ? groupAdmins.includes(botNumber2) : false;
      const isAdmins = isGroup && groupAdmins ? groupAdmins.includes(sender) : false;

      const reply = (text) => FlexMusic.sendMessage(from, { text }, { quoted: mek });

      if (isCmd) {
        const cmd = commands.find((c) => c.pattern === commandName || (c.alias && c.alias.includes(commandName)));
        if (cmd) {
          if (cmd.react) FlexMusic.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
          try {
            await cmd.function(FlexMusic, mek, m, {
              from, quoted: mek, body, isCmd, command: commandName, args, q,
              isGroup, sender, senderNumber, botNumber2, botNumber, pushname,
              isMe, isOwner, groupMetadata, groupName, participants, groupAdmins,
              isBotAdmins, isAdmins, reply,
            });
          } catch (e) {
            console.error("[PLUGIN ERROR]", e);
          }
        }
      }

      const replyText = body;
      for (const handler of replyHandlers) {
        if (handler.filter(replyText, { sender, message: mek })) {
          try {
            await handler.function(FlexMusic, mek, m, {
              from, quoted: mek, body: replyText, sender, reply,
            });
            break;
          } catch (e) {
            console.log("Reply handler error:", e);
          }
        }
      }
    });
  } catch (err) {
    console.error("WA connection error:", err);
    process.exit(1);
  }
}

ensureSessionFile();

app.get("/", (req, res) => {
  res.send("Hey, FlexMusic | 🎧🌎✅");
});

app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));

// Handle process errors globally
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
