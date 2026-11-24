(() => {
  "use strict";

  const EMAIL = "lakindusathsara65@gmail.com";
  const DISPLAY_RATING = "4.8";

  function mountReviewWidget() {
    const footer = document.querySelector(".footer");
    if (!footer || footer.querySelector(".ap-review-widget")) return false;

    const widget = document.createElement("section");
    widget.className = "ap-review-widget";
    widget.setAttribute("aria-labelledby", "ap-review-title");
    widget.innerHTML = `
      <div class="ap-review-summary">
        <div class="ap-review-heading">
          <span class="ap-review-kicker">YOUR FEEDBACK</span>
          <h2 id="ap-review-title">Enjoying Apokolips?</h2>
          <p>Share a quick rating and help make the experience better.</p>
        </div>
        <div class="ap-review-score" aria-label="Displayed site rating ${DISPLAY_RATING} out of 5">
          <strong>${DISPLAY_RATING}</strong>
          <span class="ap-review-score-stars" aria-hidden="true">★★★★★</span>
          <small>Site rating</small>
        </div>
      </div>
      <button class="ap-review-open" type="button" aria-haspopup="dialog" aria-controls="ap-review-dialog">
        Write a Review <span aria-hidden="true">↗</span>
      </button>`;

    const visitorCounter = footer.querySelector(".visitor-counter");
    if (visitorCounter) footer.insertBefore(widget, visitorCounter);
    else footer.appendChild(widget);

    const dialog = document.createElement("div");
    dialog.className = "ap-review-backdrop";
    dialog.id = "ap-review-dialog";
    dialog.hidden = true;
    dialog.innerHTML = `
      <section class="ap-review-dialog" role="dialog" aria-modal="true" aria-labelledby="ap-review-dialog-title" aria-describedby="ap-review-dialog-description" tabindex="-1">
        <button class="ap-review-close" type="button" aria-label="Close review form">×</button>
        <span class="ap-review-kicker">APOKOLIPS / FEEDBACK</span>
        <h2 id="ap-review-dialog-title">Write a Review</h2>
        <p class="ap-review-dialog-description" id="ap-review-dialog-description">Your feedback helps us improve the Apokolips experience.</p>
        <form class="ap-review-form">
          <fieldset class="ap-review-rating">
            <legend>Your rating</legend>
            <div class="ap-review-stars" role="group" aria-label="Choose a rating from 1 to 5">
              ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="ap-review-star" data-rating="${n}" aria-label="${n} star${n === 1 ? "" : "s"}" aria-pressed="${n === 5 ? "true" : "false"}">★</button>`).join("")}
            </div>
            <span class="ap-review-rating-hint" aria-live="polite">5 out of 5</span>
          </fieldset>
          <label class="ap-review-label" for="ap-review-message">Your review</label>
          <textarea id="ap-review-message" name="message" rows="4" maxlength="1000" required minlength="3" placeholder="Tell us what you think about Apokolips..."></textarea>
          <div class="ap-review-dialog-footer">
            <span class="ap-review-private">Your message is sent privately by email.</span>
            <button class="ap-review-send" type="submit">Send review <span aria-hidden="true">↗</span></button>
          </div>
          <p class="ap-review-status" role="status" aria-live="polite"></p>
        </form>
      </section>`;
    document.body.appendChild(dialog);

    let selectedRating = 5;
    let previousFocus = null;
    let previousOverflow = "";
    const openButton = widget.querySelector(".ap-review-open");
    const closeButton = dialog.querySelector(".ap-review-close");
    const dialogPanel = dialog.querySelector(".ap-review-dialog");
    const stars = [...dialog.querySelectorAll(".ap-review-star")];
    const hint = dialog.querySelector(".ap-review-rating-hint");
    const message = dialog.querySelector("#ap-review-message");
    const status = dialog.querySelector(".ap-review-status");

    function setRating(value) {
      selectedRating = value;
      stars.forEach((star) => {
        const active = Number(star.dataset.rating) <= value;
        star.classList.toggle("is-active", active);
        star.setAttribute("aria-pressed", String(Number(star.dataset.rating) === value));
      });
      hint.textContent = value + " out of 5";
    }

    function openDialog() {
      previousFocus = document.activeElement;
      previousOverflow = document.body.style.overflow;
      dialog.hidden = false;
      document.body.style.overflow = "hidden";
      setRating(5);
      status.textContent = "";
      window.requestAnimationFrame(() => stars[4].focus());
    }

    function closeDialog() {
      if (dialog.hidden) return;
      dialog.hidden = true;
      document.body.style.overflow = previousOverflow;
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    }

    openButton.addEventListener("click", openDialog);
    closeButton.addEventListener("click", closeDialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog();
    });

    document.addEventListener("keydown", (event) => {
      if (dialog.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key === "Tab") {
        const focusable = [...dialogPanel.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    stars.forEach((star) => {
      star.addEventListener("click", () => setRating(Number(star.dataset.rating)));
      star.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          const next = Math.min(5, selectedRating + 1);
          setRating(next);
          stars[next - 1].focus();
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          const next = Math.max(1, selectedRating - 1);
          setRating(next);
          stars[next - 1].focus();
        }
      });
    });
    setRating(5);

    dialog.querySelector(".ap-review-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const review = message.value.trim();
      if (review.length < 3) {
        status.textContent = "Please write a review with at least 3 characters.";
        message.focus();
        return;
      }

      const subject = "Apokolips Website Review — " + selectedRating + "/5 Stars";
      const body = [
        "New Apokolips website review",
        "",
        "Rating: " + selectedRating + "/5 stars",
        "",
        "Review:",
        review,
        "",
        "Sent from: https://apokolips.xyz/"
      ].join("\n");
      const mailto = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      status.textContent = "Opening your email app. Please press Send there to submit your review.";
      window.location.href = mailto;
    });

    return true;
  }

  if (!mountReviewWidget()) {
    const observer = new MutationObserver(() => {
      if (mountReviewWidget()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }
})();