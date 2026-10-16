// Telegram approval buttons and durable public reviews in a separate GitHub branch.
// No pending review is stored in the public repository.
const { timingSafeEqual, createHash } = require("node:crypto");

const repo = "Nik8722/Remtexnik-site";
const reviewsBranch = "reviews-data";
const githubToken = process.env.GH_REVIEWS_TOKEN;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
// For a private chat the Telegram chat ID is the owner user ID.
const adminUserId = String(process.env.TELEGRAM_ADMIN_USER_ID || (/^\d+$/.test(process.env.TELEGRAM_CHAT_ID || "") ? process.env.TELEGRAM_CHAT_ID : ""));
// Use a deterministic secret derived from the existing private bot token.
const webhookSecret = botToken ? createHash("sha256").update(botToken + ":review-webhook-v1").digest("hex") : "";
const siteUrl = (process.env.SITE_PUBLIC_URL || "https://remtexnik-site.onrender.com").replace(/\/$/, "");
const chatId = String(process.env.TELEGRAM_CHAT_ID || "");
const enabled = Boolean(githubToken && botToken && chatId && webhookSecret && siteUrl);
const missingSettings = ["GH_REVIEWS_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"].filter((key) => !process.env[key]);
if (enabled && chatId.startsWith("-") && !adminUserId) {
  console.warn("Review moderation: group chat requires TELEGRAM_ADMIN_USER_ID.");
}
console.log("Review moderation: " + (enabled ? "configured" : "inactive; missing " + missingSettings.join(", ")));

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error("Telegram " + method + " failed: " + (result.description || response.status));
  return result.result;
}

async function github(method, sha, records) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/reviews.json` + (method === "GET" ? "?ref=" + reviewsBranch : ""),
    {
      method,
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "RemTexNik-review-moderation",
        ...(method === "PUT" ? { "Content-Type": "application/json" } : {})
      },
      ...(method === "PUT" ? { body: JSON.stringify({
        message: "Approve customer review",
        branch: reviewsBranch, sha,
        content: Buffer.from(JSON.stringify(records, null, 2) + "\n").toString("base64")
      }) } : {}),
      signal: AbortSignal.timeout(12000)
    }
  );
  if (!response.ok) {
    const error = new Error("GitHub review storage HTTP " + response.status);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function load() {
  const data = await github("GET");
  const parsed = JSON.parse(Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8"));
  if (!Array.isArray(parsed)) throw new Error("Reviews store is not an array");
  return { sha: data.sha, items: parsed };
}

async function publishedReviews() {
  const { items } = await load();
  return items.filter(item => item.status === "approved").map(({ id, name, rating, text, date }) =>
    ({ id, name, rating, text, date }));
}

async function approve(record) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { sha, items } = await load();
    if (items.some(item => item.id === record.id)) return "already";
    try {
      await github("PUT", sha, [{ ...record, status: "approved" }, ...items]);
      return "approved";
    } catch (error) {
      if (error.status !== 409 || attempt === 3) throw error;
    }
  }
}

function encodeReview(record) {
  // The customer name is one line; the review text is the final free-form field.
  const name = record.name.replace(/[\r\n]+/g, " ").slice(0, 60);
  return `📝 Новий відгук RemTexNik\nID: ${record.id}\nІм’я: ${name}\nОцінка: ${record.rating}/5\nДата: ${record.date}\nТекст:\n${record.text}`;
}

function decodeReview(message) {
  const match = /^📝 Новий відгук RemTexNik\nID: ([a-f0-9-]{36})\nІм’я: ([^\r\n]{1,60})\nОцінка: ([1-5])\/5\nДата: (\d{4}-\d\d-\d\dT[^\r\n]+)\nТекст:\n([\s\S]{1,1000})$/.exec(message || "");
  if (!match) throw new Error("Invalid review moderation message");
  return { id: match[1], name: match[2], rating: Number(match[3]), date: match[4], text: match[5] };
}

async function sendForApproval(review, chatId) {
  if (!enabled) throw new Error("Moderation is not configured");
  return telegram("sendMessage", {
    chat_id: chatId,
    text: encodeReview(review),
    reply_markup: { inline_keyboard: [[
      { text: "✅ Опублікувати", callback_data: "approve:" + review.id },
      { text: "❌ Відхилити", callback_data: "reject:" + review.id }
    ]] }
  });
}

function authenticated(request) {
  const received = request.headers["x-telegram-bot-api-secret-token"];
  if (typeof received !== "string" || !webhookSecret) return false;
  const a = Buffer.from(received), b = Buffer.from(webhookSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function processUpdate(update) {
  const query = update?.callback_query;
  if (!query) return;
  const isPrivateOwner = query.message?.chat?.type === "private" && String(query.message?.chat?.id) === chatId && String(query.from?.id) === chatId;
  if (String(query.from?.id) !== adminUserId && !isPrivateOwner) {
    await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Лише адміністратор може керувати відгуками.", show_alert: true });
    return;
  }
  if (!query.message || !query.message.chat || !query.message.message_id) throw new Error("Missing Telegram moderation message");
  const match = /^(approve|reject):([a-f0-9-]{36})$/.exec(query.data || "");
  if (!match) return;
  const record = decodeReview(query.message.text);
  if (record.id !== match[2]) throw new Error("Review ID mismatch");
  const action = match[1] === "approve" ? await approve(record) : "rejected";
  await telegram("answerCallbackQuery", { callback_query_id: query.id,
    text: action === "approved" ? "Відгук опубліковано!" : action === "already" ? "Відгук уже опубліковано." : "Відгук відхилено." });
  await telegram("editMessageReplyMarkup", {
    chat_id: query.message.chat.id, message_id: query.message.message_id,
    reply_markup: { inline_keyboard: [] }
  });
  await telegram("sendMessage", { chat_id: query.message.chat.id,
    text: action === "approved" ? "✅ Відгук опубліковано на сайті." : action === "already" ? "ℹ️ Цей відгук уже був опублікований." : "❌ Відгук відхилено." });
}

async function registerWebhook() {
  if (!enabled) return false;
  await telegram("setWebhook", {
    url: siteUrl + "/api/telegram-review-webhook",
    secret_token: webhookSecret,
    allowed_updates: ["callback_query"],
    drop_pending_updates: false
  });
  return true;
}

module.exports = { enabled, authenticated, sendForApproval, processUpdate, publishedReviews, registerWebhook };
