import TelegramBot from "node-telegram-bot-api";
import axios from "axios";

// ===== CONFIG =====
const token = "8419812417:AAGUlicrm8IGsRaEjBiVTiKFBfaB1WifYv0";

const bot = new TelegramBot(token, { polling: true });

console.log("Bot running...");

// ===== TOKEN → COINGECKO MAP =====
const tokenMap = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  BNB: "binancecoin",
  SOL: "solana"
};

// ===== START =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
`🤖 IntercomSwap Telegram Bot

Commands:
• /swap 10 ETH USDT
• /price ETH → real price
• /chart ETH → price chart
• /help`
  );
});

// ===== HELP =====
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
`📖 Cara penggunaan:

/swap <jumlah> <token_asal> <token_tujuan>
/price <token>
/chart <token>

Contoh:
• /swap 10 ETH USDT
• /price BTC
• /chart ETH`
  );
});

// ===== SWAP =====
bot.onText(/\/swap (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;

  try {
    const args = match[1].split(" ");

    if (args.length < 3) {
      bot.sendMessage(chatId, "❌ Format: /swap jumlah TOKEN TOKEN");
      return;
    }

    const amount = args[0];
    const from = args[1].toUpperCase();
    const to = args[2].toUpperCase();

    if (isNaN(amount)) {
      bot.sendMessage(chatId, "❌ Jumlah harus angka.");
      return;
    }

    const processingMsg = await bot.sendMessage(
      chatId,
`⏳ Memproses swap...

Amount: ${amount}
From: ${from}
To: ${to}`
    );

    // placeholder proses swap
    await new Promise(resolve => setTimeout(resolve, 3000));

    bot.editMessageText(
`✅ Swap request processed

Amount: ${amount}
From: ${from}
To: ${to}
Status: Completed`,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id
      }
    );

  } catch (err) {
    bot.sendMessage(chatId, "⚠️ Error processing swap.");
  }
});

// ===== REAL PRICE =====
bot.onText(/\/price (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const symbol = match[1].toUpperCase();

  if (!tokenMap[symbol]) {
    bot.sendMessage(chatId, "❌ Token tidak didukung.");
    return;
  }

  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${tokenMap[symbol]}&vs_currencies=usd`
    );

    const price = res.data[tokenMap[symbol]].usd;

    bot.sendMessage(
      chatId,
`💰 ${symbol} Price (Live)
$${price} USD`
    );

  } catch (err) {
    bot.sendMessage(chatId, "⚠️ Gagal ambil harga.");
  }
});

// ===== CHART IMAGE =====
bot.onText(/\/chart (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const symbol = match[1].toUpperCase();

  if (!tokenMap[symbol]) {
    bot.sendMessage(chatId, "❌ Token tidak didukung.");
    return;
  }

  try {
    bot.sendMessage(chatId, "📊 Mengambil chart...");

    // ambil data 7 hari
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${tokenMap[symbol]}/market_chart?vs_currency=usd&days=7`
    );

    const prices = res.data.prices.map(p => p[1]);

    // generate chart image URL
    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
      type: "line",
      data: {
        labels: prices.map((_, i) => i),
        datasets: [{
          label: `${symbol} price`,
          data: prices
        }]
      }
    }))}`;

    await bot.sendPhoto(chatId, chartUrl, {
      caption: `📈 ${symbol} 7-day price chart`
    });

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "⚠️ Gagal ambil chart.");
  }
});

// ===== UNKNOWN =====
bot.on("message", (msg) => {
  if (!msg.text) return;

  const valid = ["/start", "/swap", "/price", "/chart", "/help"]
    .some(cmd => msg.text.startsWith(cmd));

  if (msg.text.startsWith("/") && !valid) {
    bot.sendMessage(msg.chat.id, "❓ Command tidak dikenali. Gunakan /help.");
  }
});