const http = require("node:http");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const publicRoot = __dirname;
const reviewsFile = process.env.REVIEWS_FILE || path.join(__dirname, "reviews.json");
const reviewsWritable = Boolean(process.env.REVIEWS_FILE);
let reviewsQueue = Promise.resolve();
const port = Number(process.env.PORT || 3000);
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png"
};
const callbackDevOrigins = new Set([
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function addCallbackCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (!callbackDevOrigins.has(origin)) {
    return;
  }

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

async function handleCallback(request, response) {
  if (!botToken || !chatId) {
    sendJson(response, 503, { error: "Telegram is not configured" });
    return;
  }

  try {
    const body = await readJson(request);
    const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
    if (!/^380\d{9}$/.test(phone)) {
      sendJson(response, 400, { error: "Invalid phone number" });
      return;
    }

    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `New callback request\nPhone: +${phone}`
      })
    });
    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramResult.ok) {
      const reason = telegramResult.description || `HTTP ${telegramResponse.status}`;
      throw new Error(`Telegram API rejected the notification: ${reason}`);
    }

    sendJson(response, 200, { ok: true });
  } catch (error) {
    if (error.statusCode) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }

    console.error("Failed to send Telegram callback notification:", error);
    sendJson(response, 502, { error: "Could not send callback notification" });
  }
}

async function handleQuestion(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (!botToken || !chatId) {
    sendJson(response, 503, { error: "Telegram is not configured" });
    return;
  }

  try {
    const body = await readJson(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!name || name.length > 60 || !/^380\d{9}$/.test(phone) || !question || question.length > 1000) {
      sendJson(response, 400, { error: "Check name, Ukrainian phone number, and question (max 1000 characters)." });
      return;
    }

    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Website question\nName: ${name}\nPhone: +${phone}\nQuestion: ${question}`
      })
    });
    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramResult.ok) {
      const reason = telegramResult.description || `HTTP ${telegramResponse.status}`;
      throw new Error(`Telegram API rejected the question: ${reason}`);
    }

    sendJson(response, 200, { ok: true });
  } catch (error) {
    if (error.statusCode) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }

    console.error("Failed to send Telegram question:", error);
    sendJson(response, 502, { error: "Could not send question" });
  }
}

function withReviewsLock(operation) {
  const result = reviewsQueue.then(operation);
  reviewsQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function readReviewsFile() {
  const reviews = JSON.parse(await fs.readFile(reviewsFile, "utf8"));

  if (!Array.isArray(reviews)) {
    throw new Error("reviews.json должен содержать массив отзывов.");
  }

  return reviews;
}

async function handleReviews(request, response) {
  if (request.method === "GET") {
    response.setHeader("X-Reviews-Writable", reviewsWritable ? "true" : "false");
    try {
      const reviews = await withReviewsLock(readReviewsFile);
      const publishedReviews = reviews
        .filter(review => review.status === "approved")
        .map(({ id, name, text, date, rating }) => ({ id, name, text, date, rating }));

      sendJson(response, 200, publishedReviews);
    } catch (error) {
      console.error("Не удалось загрузить отзывы:", error);
      sendJson(response, 500, { error: "Не удалось загрузить отзывы." });
    }

    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Метод не поддерживается." });
    return;
  }

  try {
    const body = await readJson(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const rating = Number(body.rating);

    if (
      !name ||
      name.length > 60 ||
      !text ||
      text.length > 1000 ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      sendJson(response, 400, {
        error: "Укажите имя, текст отзыва и оценку от 1 до 5 звёзд."
      });
      return;
    }

    const review = {
      id: randomUUID(),
      name,
      text,
      rating,
      date: new Date().toISOString(),
      status: "pending"
    };

    await withReviewsLock(async () => {
      const reviews = await readReviewsFile();
      reviews.unshift(review);
      await fs.writeFile(reviewsFile, JSON.stringify(reviews, null, 2) + "\n", "utf8");
    });

    sendJson(response, 202, { ok: true });
  } catch (error) {
    if (error.statusCode) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }

    console.error("Не удалось сохранить отзыв:", error);
    sendJson(response, 500, { error: "Не удалось сохранить отзыв." });
  }
}
async function serveStatic(urlPath, response) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const requestedPath =
    decodedPath === "/" || decodedPath === "/golovna"
      ? "/index.html"
      : decodedPath;
  const filePath = path.resolve(publicRoot, `.${requestedPath}`);
  const relativePath = path.relative(publicRoot, filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    relativePath === "server.js" ||
    relativePath === "reviews.json" ||
    relativePath === "package.json" ||
    relativePath === ".env" ||
    !contentTypes[extension]
  ) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const contents = await fs.readFile(filePath);
    const cacheControl = [".html", ".css", ".js"].includes(extension)
      ? "no-cache"
      : "public, max-age=86400";
    response.writeHead(200, {
      "Cache-Control": cacheControl,
      "Content-Type": contentTypes[extension]
    });
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, "http://localhost");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (requestUrl.pathname === "/blog.html") {
    response.writeHead(301, { Location: "/" });
    response.end();
    return;
  }
  if (requestUrl.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (requestUrl.pathname === "/index.html") {
    response.writeHead(301, { Location: "/golovna" });
    response.end();
    return;
  }

  if (requestUrl.pathname === "/api/reviews") {
    await handleReviews(request, response);
    return;
  }
  if (requestUrl.pathname === "/api/question") {
    addCallbackCorsHeaders(request, response);

    if (request.method === "OPTIONS") {
      if (!callbackDevOrigins.has(request.headers.origin)) {
        sendJson(response, 403, { error: "Origin not allowed" });
        return;
      }
      response.writeHead(204);
      response.end();
      return;
    }

    await handleQuestion(request, response);
    return;
  }
  if (requestUrl.pathname === "/api/callback") {
    addCallbackCorsHeaders(request, response);

    if (request.method === "OPTIONS") {
      if (!callbackDevOrigins.has(request.headers.origin)) {
        sendJson(response, 403, { error: "Origin not allowed" });
        return;
      }
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    await handleCallback(request, response);
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }

  await serveStatic(requestUrl.pathname, response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Site available at http://localhost:${port}`);
});
