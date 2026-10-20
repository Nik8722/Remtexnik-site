function formatUkrainianPhoneInput(input) {
  const rawDigits = input.value.replace(/\D/g, "");
  let subscriberDigits = rawDigits;

  if (rawDigits.startsWith("380")) {
    subscriberDigits = rawDigits.slice(3);
  } else if (rawDigits.startsWith("0")) {
    subscriberDigits = rawDigits.slice(1);
  }

  subscriberDigits = subscriberDigits.slice(0, 9);
  const first = subscriberDigits.slice(0, 2);
  const second = subscriberDigits.slice(2, 5);
  const third = subscriberDigits.slice(5, 7);
  const fourth = subscriberDigits.slice(7, 9);

  let formatted = "+38 (0";
  if (first) formatted += first;
  if (first.length === 2) formatted += ")";
  if (second) formatted += ` ${second}`;
  if (third) formatted += ` ${third}`;
  if (fourth) formatted += ` ${fourth}`;

  input.value = formatted;
}

document.querySelectorAll(
  "#phoneInput, #question-phone, #callback-widget-phone"
).forEach(input => {
  formatUkrainianPhoneInput(input);
  input.addEventListener("input", () => formatUkrainianPhoneInput(input));
});

function focusPhoneInput(input) {
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function openContact() {
  const modal = document.getElementById("contact-modal");
  modal.style.display = "flex";
  focusPhoneInput(document.getElementById("phoneInput"));
}
function closeContact() {
  document.getElementById("contact-modal").style.display = "none";
}
function openQuestion() {
  const modal = document.getElementById("question-modal");
  modal.style.display = "flex";
  document.getElementById("question-name").focus();
}
function closeQuestion() {
  document.getElementById("question-modal").style.display = "none";
}
async function sendWidgetCallback(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const phoneInput = document.getElementById("callback-widget-phone");
  const message = document.getElementById("callback-widget-message");
  const digits = phoneInput.value.replace(/\D/g, "");
  const phone = digits.length === 10 && digits.startsWith("0") ? `38${digits}` : digits;
  const submitButton = form.querySelector('button[type="submit"]');

  if (!/^380\d{9}$/.test(phone)) {
    message.textContent = "Введіть український номер телефону.";
    return;
  }

  submitButton.disabled = true;
  message.textContent = "";

  try {
    const callbackUrl = window.location.port === "5500"
      ? "http://localhost:3000/api/callback"
      : "/api/callback";
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Callback request failed (${response.status})`);
    }

    form.reset();
    message.textContent = "Дякуємо! Ми скоро зателефонуємо.";
  } catch (error) {
    console.error("Failed to send callback request:", error);
    message.textContent = "Не вдалося надіслати заявку. Зателефонуйте: +38 (095) 493 26 01.";
  } finally {
    submitButton.disabled = false;
  }
}
async function sendPhone(event) {
  event.preventDefault();
  const digits = document.getElementById("phoneInput").value.replace(/\D/g, "");
  const phone = digits;
  if (!/^380\d{9}$/.test(phone)) {
    const message = document.getElementById("contact-message");
    if (message) message.textContent = "Введіть український номер у форматі +38 (0__) ___ __ __.";
    return;
  }
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const callbackUrl = window.location.port === "5500"
      ? "http://localhost:3000/api/callback"
      : "/api/callback";
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || `Callback request failed (${response.status})`);
    }

    alert("Дякуємо! Заявку надіслано, ми скоро зателефонуємо.");
    closeContact();
  } catch (error) {
    console.error("Failed to send callback request:", error);
    const message = document.getElementById("contact-message");
    if (message) message.innerHTML = 'Немає підтвердження надсилання. <a href="tel:+380954932601">Зателефонуйте нам</a> або напишіть в <a href="https://www.instagram.com/remtexnik.dp/">Instagram</a>.';
  } finally {
    submitButton.disabled = false;
  }
}
async function sendQuestion(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const name = document.getElementById("question-name").value.trim();
  const digits = document.getElementById("question-phone").value.replace(/\D/g, "");
  const phone = digits;
  const question = document.getElementById("question-text").value.trim();
  const message = document.getElementById("question-message");
  const submitButton = form.querySelector('button[type="submit"]');

  if (!/^380\d{9}$/.test(phone)) {
    message.textContent = "Введіть український номер телефону у форматі +38 (0__) ___ __ __.";
    return;
  }

  submitButton.disabled = true;
  message.textContent = "";

  try {
    const questionUrl = window.location.port === "5500"
      ? "http://localhost:3000/api/question"
      : "/api/question";
    const response = await fetch(questionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, question })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Question request failed (${response.status})`);
    }

    form.reset();
    message.textContent = "Дякуємо! Ваше питання надіслано.";
    window.setTimeout(closeQuestion, 1500);
  } catch (error) {
    console.error("Failed to send question:", error);
    message.textContent = "Не вдалося надіслати питання. Зателефонуйте: +38 (095) 493 26 01.";
  } finally {
    submitButton.disabled = false;
  }
}

const callbackWidgetTrigger = document.getElementById("callback-widget-trigger");
const callbackWidgetPanel = document.getElementById("callback-widget-panel");
const callbackWidgetClose = document.getElementById("callback-widget-close");

if (callbackWidgetTrigger && callbackWidgetPanel && callbackWidgetClose) {
  let callbackPopupTimer;

  const showCallbackPanel = (focusInput = false) => {
    callbackWidgetPanel.hidden = false;
    callbackWidgetTrigger.setAttribute("aria-expanded", "true");
    try { sessionStorage.setItem("remtexnik-callback-seen", "1"); } catch {}
    if (focusInput) focusPhoneInput(document.getElementById("callback-widget-phone"));
  };

  callbackWidgetTrigger.addEventListener("click", () => {
    window.clearTimeout(callbackPopupTimer);
    showCallbackPanel(true);
  });

  callbackWidgetClose.addEventListener("click", () => {
    window.clearTimeout(callbackPopupTimer);
    callbackWidgetPanel.hidden = true;
    callbackWidgetTrigger.setAttribute("aria-expanded", "false");
    callbackWidgetTrigger.focus();
  });

  let callbackAlreadyShown = false;
  try { callbackAlreadyShown = sessionStorage.getItem("remtexnik-callback-seen") === "1"; } catch {}
  if (!callbackAlreadyShown) {
    callbackPopupTimer = window.setTimeout(() => showCallbackPanel(false), 45000);
  }
}


const reviewsList = document.getElementById("reviews-list");

if (reviewsList) {
  const reviewForm = document.getElementById("review-form");
  const formToggle = document.getElementById("review-form-toggle");
  const cancelButton = document.getElementById("review-cancel");
  const moreButton = document.getElementById("reviews-more");
  const message = document.getElementById("reviews-message");

  let showAllReviews = false;

  function createReviewCard(review) {
    const card = document.createElement("article");
    card.className = "review-card";

    const stars = document.createElement("div");
    stars.className = "review-stars";
    const rating = Number.isInteger(Number(review.rating)) && Number(review.rating) >= 1 && Number(review.rating) <= 5
      ? Number(review.rating)
      : 5;
    stars.textContent = `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
    stars.setAttribute("aria-label", `Оцінка: ${rating} з 5`);
    stars.setAttribute("role", "img");

    const text = document.createElement("p");
    text.className = "review-text";

    const fullText = review.text.trim();
    const textCharacters = Array.from(fullText);
    const previewLength = 150;
    const hasMoreText = textCharacters.length > previewLength;
    let expanded = false;
    let detailsButton = null;

    function updateReviewText() {
      text.textContent = expanded || !hasMoreText
        ? fullText
        : `${textCharacters.slice(0, previewLength).join("").trimEnd()}…`;
    }

    updateReviewText();

    if (hasMoreText) {
      detailsButton = document.createElement("button");
      detailsButton.className = "review-details-toggle";
      detailsButton.type = "button";
      detailsButton.textContent = "Детальніше";
      detailsButton.setAttribute("aria-expanded", "false");
      detailsButton.addEventListener("click", () => {
        expanded = !expanded;
        detailsButton.textContent = expanded ? "Сховати" : "Детальніше";
        detailsButton.setAttribute("aria-expanded", String(expanded));
        updateReviewText();
      });
    }

    const authorBlock = document.createElement("div");
    authorBlock.className = "review-author-block";

    const avatar = document.createElement("span");
    avatar.className = "review-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = review.name.trim().charAt(0).toLocaleUpperCase("uk-UA");

    const author = document.createElement("p");
    author.className = "review-author";
    author.textContent = review.name;

    authorBlock.append(avatar, author);
    card.append(stars, text);
    if (detailsButton) {
      card.append(detailsButton);
    }
    card.append(authorBlock);
    return card;
  }

  function updateReviewsVisibility() {
    const cards = Array.from(reviewsList.children);

    cards.forEach((card, index) => {
      card.hidden = index >= 3 && !showAllReviews;
    });

    moreButton.hidden = cards.length <= 3;
    moreButton.textContent = showAllReviews
      ? "Згорнути відгуки"
      : "Показати ще відгуки";
  }

  async function loadReviews() {
    try {
      const response = await fetch("/api/reviews");

      if (!response.ok) {
        throw new Error(`Не вдалося завантажити відгуки: HTTP ${response.status}`);
      }

      const reviews = await response.json();
      if (response.headers.get("X-Reviews-Writable") === "false") {
        formToggle.hidden = true;
        reviewForm.hidden = true;
        message.textContent = "Додавання відгуків тимчасово недоступне. Для зв’язку скористайтеся телефоном або Instagram.";
      }

      if (!Array.isArray(reviews)) {
        throw new Error("Сервер повернув некоректний список відгуків.");
      }

      reviewsList.replaceChildren(...reviews.map(createReviewCard));
      if (!reviews.length && response.headers.get("X-Reviews-Writable") !== "false") {
        message.textContent = "Поки немає опублікованих відгуків. Напишіть перший — він з’явиться після модерації.";
      }
      updateReviewsVisibility();
    } catch (error) {
      console.error("Ошибка загрузки отзывов:", error);
      message.textContent = "Не вдалося завантажити відгуки. Оновіть сторінку.";
    }
  }

  formToggle.addEventListener("click", () => {
    reviewForm.hidden = !reviewForm.hidden;
    formToggle.textContent = reviewForm.hidden
      ? "ДОДАТИ ВІДГУК"
      : "ЗАКРИТИ ФОРМУ";
  });

  cancelButton.addEventListener("click", () => {
    reviewForm.reset();
    reviewForm.hidden = true;
    formToggle.textContent = "ДОДАТИ ВІДГУК";
  });

  moreButton.addEventListener("click", () => {
    showAllReviews = !showAllReviews;
    updateReviewsVisibility();
  });

  reviewForm.addEventListener("submit", async event => {
    event.preventDefault();

    const submitButton = reviewForm.querySelector('button[type="submit"]');
    const name = document.getElementById("review-name").value.trim();
    const text = document.getElementById("review-text").value.trim();
    const rating = Number(reviewForm.querySelector('input[name="rating"]:checked')?.value);

    submitButton.disabled = true;
    message.textContent = "";

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text, rating })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Не удалось отправить отзыв: HTTP ${response.status}`);
      }

      reviewForm.reset();
      reviewForm.hidden = true;
      formToggle.textContent = "ДОДАТИ ВІДГУК";
      message.textContent = "Дякуємо! Відгук надіслано на перевірку.";
    } catch (error) {
      console.error("Ошибка отправки отзыва:", error);
      message.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  loadReviews();
}

// Deep links allow callback and question dialogs from other pages.
if (location.hash === "#contact" && document.getElementById("contact-modal")) openContact();
if (location.hash === "#question" && document.getElementById("question-modal")) openQuestion();
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (document.getElementById("contact-modal")) closeContact();
    if (document.getElementById("question-modal")) closeQuestion();
  }
});

// Shared social links on every page that loads script.js.
function mountSocialLinks() {
  if (document.querySelector(".social-links-rail")) return;

  const profiles = [
    {
      name: "Facebook",
      className: "facebook",
      url: "https://www.facebook.com/profile.php?id=61595621093680",
      icon: '<path fill="currentColor" d="M13.8 22v-8.7h2.9l.4-3.4h-3.3V7.7c0-1 .3-1.7 1.7-1.7h1.8V3a24 24 0 0 0-2.7-.1c-2.7 0-4.6 1.7-4.6 4.7v2.3H7v3.4h3V22z"/>'
    },
    {
      name: "Instagram",
      className: "instagram",
      url: "https://www.instagram.com/remtexnik.dp/",
      icon: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>'
    }
  ].filter(profile => profile.url);

  const rail = document.createElement("nav");
  rail.className = "social-links-rail";
  rail.setAttribute("aria-label", "RemTexNik у соціальних мережах");

  profiles.forEach(profile => {
    const link = document.createElement("a");
    link.className = `social-links-rail__link social-links-rail__link--${profile.className}`;
    link.href = profile.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `RemTexNik у ${profile.name} (нова вкладка)`);
    link.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${profile.icon}</svg>`;
    const label = document.createElement("span");
    label.className = "social-links-rail__label";
    label.textContent = profile.name;
    link.append(label);
    rail.append(link);
  });

  document.body.append(rail);
}

mountSocialLinks();
