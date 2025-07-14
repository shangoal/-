const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
SESSION_ID: process.env.SESSION_ID || "",
ALIVE_IMG: process.env.ALIVE_IMG || "https://github.com/shangoal/-/blob/main/images/flex%20Music.jpg?raw=true",
ALIVE_MSG: process.env.ALIVE_MSG || "*Hey there👋 𝗙𝗹𝗲𝘅 𝗠𝘂𝘀𝗶𝗰 | 🎧🌎 Is Alive Now😍*",
BOT_OWNER: '94764527598',



};
