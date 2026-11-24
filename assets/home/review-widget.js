(() => {
  "use strict";

  const EMAIL = "lakindusathsara65@gmail.com";
  const DISPLAY_RATING = "4.8";
  const DISPLAY_COUNT = "Community rating";

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
        <div class="ap-review-score" aria-label="Starting site rating ${DISPLAY_RATING} out of 5">
          <strong>${DISPLAY_RATING}</strong>
          <span class="ap-review-score-stars" aria-hidden="true">★★★★★</span>
          <small>${DISPLAY_COUNT}</small>
        </div>
      </div>
      <form class="ap-review-form">
        <fieldset class="ap-review-rating">
          <legend>Your rating</legend>
          <div class="ap-review-stars" role="group" aria-label="Choose a rating from 1 to 5">
            ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="ap-review-star" data-rating="${n}" aria-label="${n} star${n === 1 ? "" : "s"}" aria-pressed="${n === 5 ? "true" : "false"}">★</button>`).join("")}
          </div>
          <span class="ap-review-rating-hint" aria-live="polite">5 out of 5</span>
        </fieldset>
        <label class="ap-review-label" for="ap-review-message">Your review</label>
        <textarea id="ap-review-message" name="message" rows="3" maxlength="1000" required placeholder="Tell us what you think about Apokolips..." ></textarea>
        <div class="ap-review-actions">
          <span class="ap-review-private">Your message is sent privately by email.</span>
          <button class="ap-review-send" type="submit">Send review <span aria-hidden="true">↗</span></button>
        </div>
        <p class="ap-review-status" role="status" aria-live="polite"></p>
      </form>`;

    const visitorCounter = footer.querySelector(".visitor-counter");
    if (visitorCounter) footer.insertBefore(widget, visitorCounter);
    else footer.appendChild(widget);

    let selectedRating = 5;
    const stars = [...widget.querySelectorAll(".ap-review-star")];
    const hint = widget.querySelector(".ap-review-rating-hint");
    const message = widget.querySelector("#ap-review-message");
    const status = widget.querySelector(".ap-review-status");

    function setRating(value) {
      selectedRating = value;
      stars.forEach((star) => {
        const active = Number(star.dataset.rating) <= value;
        star.classList.toggle("is-active", active);
        star.setAttribute("aria-pressed", String(Number(star.dataset.rating) === value));
      });
      hint.textContent = value + " out of 5";
    }

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

    widget.querySelector(".ap-review-form").addEventListener("submit", (event) => {
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