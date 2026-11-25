import { ASSIGNMENT_QUESTIONS, ASSIGNMENT_VERSION } from "./questions.js";

(() => {
  "use strict";

  const previewId = window.location.hostname.match(/^deploy-preview-(\d+)--apokolips\.netlify\.app$/)?.[1];
  const API_ORIGIN = previewId
    ? `https://deploy-preview-${previewId}--apolonia-ai-api.netlify.app`
    : "https://apolonia-ai-api.netlify.app";
  const API_URL = `${API_ORIGIN}/api/assignment/evaluate`;
  const STORAGE_KEY = `apokolips.assignment.draft.${ASSIGNMENT_VERSION}`;
  const questions = ASSIGNMENT_QUESTIONS;
  const answers = Object.create(null);
  const skipped = new Set();
  let currentIndex = 0;
  let submitting = false;
  let submitted = false;

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    grid: $("#question-grid"), number: $("#question-number"), difficulty: $("#question-difficulty"),
    type: $("#question-type"), title: $("#question-title"), answerArea: $("#answer-area"),
    previous: $("#previous-button"), next: $("#next-button"), navigationCount: $("#navigation-count"),
    indexCount: $("#index-count"), progressLabel: $("#progress-label"), progressPercent: $("#progress-percent"),
    progressBar: $("#progress-bar"), progressFill: $("#progress-fill"), submit: $("#submit-button"),
    submitHint: $("#submit-hint"), status: $("#status-message"), result: $("#result-section"),
    skip: $("#skip-button"), studyGuide: $("#study-guide-button")
  };
  const difficultyLabels = { easy: "Easy", medium: "Medium", hard: "Hard", "very-hard": "Very Hard" };

  function setStatus(message, type = "") {
    elements.status.textContent = message;
    elements.status.className = `status-message ${type}`.trim();
  }
  function loadDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && saved.version === ASSIGNMENT_VERSION && saved.answers && typeof saved.answers === "object") {
        questions.forEach((question) => {
          const value = saved.answers[question.id];
          if (typeof value === "string" && value.length <= 1800) answers[question.id] = value;
        });
        if (Array.isArray(saved.skipped)) saved.skipped.forEach((id) => {
          if (questions.some((question) => question.id === id) && !String(answers[id] || "").trim()) skipped.add(id);
        });
      }
    } catch (_) { try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} }
  }
  function saveDraft() {
    if (submitted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: ASSIGNMENT_VERSION, updatedAt: new Date().toISOString(), answers, skipped: [...skipped] }));
    } catch (_) { setStatus("This browser could not save your draft. Keep this page open until you submit.", "error"); }
  }
  function answeredCount() {
    return questions.reduce((count, question) => count + (String(answers[question.id] || "").trim() ? 1 : 0), 0);
  }
  function completedCount() { return answeredCount() + skipped.size; }
  function updateProgress() {
    const answered = answeredCount();
    const count = completedCount();
    const percent = Math.round((count / questions.length) * 100);
    elements.progressLabel.textContent = `${answered} answered · ${skipped.size} skipped`;
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressFill.style.width = `${percent}%`;
    elements.progressBar.setAttribute("aria-valuenow", String(count));
    elements.submit.disabled = count !== questions.length || submitting || submitted;
    elements.submitHint.textContent = count === questions.length
      ? "All questions are answered or skipped. Review your work, then submit for Apolonia AI evaluation."
      : `${questions.length - count} question${questions.length - count === 1 ? "" : "s"} remaining. Answer or skip each question to continue.`;
    elements.grid.querySelectorAll(".question-index").forEach((button, index) => {
      const question = questions[index];
      const isAnswered = Boolean(String(answers[question.id] || "").trim());
      const isSkipped = skipped.has(question.id);
      button.classList.toggle("answered", isAnswered);
      button.classList.toggle("skipped", isSkipped);
      button.classList.toggle("current", index === currentIndex);
      button.setAttribute("aria-current", index === currentIndex ? "step" : "false");
      button.setAttribute("aria-label", `Question ${index + 1}${isAnswered ? ", answered" : isSkipped ? ", skipped" : ", not answered"}`);
    });
  }
  function buildIndex() {
    const fragment = document.createDocumentFragment();
    questions.forEach((question, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "question-index";
      button.textContent = String(index + 1).padStart(2, "0");
      button.addEventListener("click", () => showQuestion(index));
      fragment.append(button);
    });
    elements.grid.replaceChildren(fragment);
  }
  function renderAnswer(question) {
    elements.answerArea.replaceChildren();
    const currentAnswer = answers[question.id] || "";
    if (question.type === "multiple-choice") {
      const list = document.createElement("div"); list.className = "option-list";
      question.options.forEach((option, index) => {
        const label = document.createElement("label"); label.className = "option-label";
        const radio = document.createElement("input");
        radio.type = "radio"; radio.name = `answer-${question.id}`; radio.value = option;
        radio.checked = currentAnswer === option; radio.disabled = submitted;
        radio.addEventListener("change", () => { answers[question.id] = option; skipped.delete(question.id); saveDraft(); updateProgress(); showQuestion(currentIndex); });
        const text = document.createElement("span"); text.textContent = `${String.fromCharCode(65 + index)}. ${option}`;
        label.append(radio, text); list.append(label);
      });
      elements.answerArea.append(list); return;
    }
    const textarea = document.createElement("textarea");
    textarea.className = "answer-textarea"; textarea.maxLength = 1800; textarea.rows = 6;
    textarea.disabled = submitted; textarea.value = currentAnswer;
    textarea.placeholder = "Write your answer in English…";
    textarea.setAttribute("aria-label", `Your answer to question ${currentIndex + 1}`);
    textarea.addEventListener("input", () => { answers[question.id] = textarea.value; if (textarea.value.trim()) skipped.delete(question.id); saveDraft(); updateProgress(); elements.skip.disabled = Boolean(textarea.value.trim()); });
    const help = document.createElement("p"); help.className = "answer-help";
    help.textContent = "Explain the idea clearly. Equivalent wording is accepted when the meaning is correct.";
    elements.answerArea.append(textarea, help);
  }
  function showQuestion(index) {
    if (submitted) return;
    currentIndex = Math.max(0, Math.min(questions.length - 1, index));
    const question = questions[currentIndex];
    elements.number.textContent = `QUESTION ${String(currentIndex + 1).padStart(2, "0")}`;
    elements.difficulty.textContent = difficultyLabels[question.difficulty];
    elements.difficulty.className = `difficulty ${question.difficulty}`;
    elements.type.textContent = question.type.replaceAll("-", " ").toUpperCase();
    elements.title.textContent = question.prompt;
    elements.indexCount.textContent = `${String(currentIndex + 1).padStart(2, "0")} / ${questions.length}`;
    elements.navigationCount.textContent = `${String(currentIndex + 1).padStart(2, "0")} / ${questions.length}`;
    elements.previous.disabled = currentIndex === 0;
    elements.next.disabled = currentIndex === questions.length - 1;
    elements.skip.textContent = skipped.has(question.id) ? "Unskip question" : "Skip question";
    elements.skip.disabled = Boolean(String(answers[question.id] || "").trim());
    elements.next.innerHTML = currentIndex === questions.length - 1
      ? "Last question <span aria-hidden=\"true\">✓</span>"
      : "Next question <span aria-hidden=\"true\">→</span>";
    renderAnswer(question); updateProgress();
  }
  async function openStudyGuide() {
    if (submitting || submitted) return;
    if (!window.confirm("Open the complete answer guide and topic summaries? This ends the current attempt without grading it. Your saved draft will remain on this device.")) return;
    elements.studyGuide.disabled = true;
    elements.studyGuide.textContent = "Loading study guide…";
    setStatus("Apolonia AI is securely retrieving the answer guide and study summaries.");
    try {
      const response = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ mode: "study-guide", assignmentVersion: ASSIGNMENT_VERSION })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The study guide could not be loaded. Please try again.");
      if (!Array.isArray(data.studyGuide) || data.studyGuide.length !== questions.length) throw new Error("The study guide response was incomplete.");
      renderStudyGuide(data.studyGuide);
      setStatus("Study guide loaded. Your attempt was not graded.", "success");
    } catch (error) {
      setStatus(error.message || "A network error occurred. Your saved draft is safe.", "error");
      elements.studyGuide.disabled = false;
      elements.studyGuide.textContent = "I can't answer — show answers & summaries";
    }
  }
  function renderStudyGuide(items) {
    submitted = true;
    elements.result.replaceChildren(); elements.result.hidden = false;
    const header = document.createElement("div"); header.className = "result-header";
    const intro = document.createElement("div");
    const kicker = document.createElement("p"); kicker.className = "section-kicker"; kicker.textContent = "APOLONIA AI / STUDY MODE";
    const title = document.createElement("h2"); title.textContent = "Answers & topic summaries";
    const summary = document.createElement("p"); summary.textContent = "Use these note-based answers to revise. This is a study guide, not a graded submission.";
    intro.append(kicker, title, summary); header.append(intro); elements.result.append(header);
    const grouped = new Map();
    items.forEach((item) => {
      const topic = item.topic || "General Information Systems";
      if (!grouped.has(topic)) grouped.set(topic, []);
      grouped.get(topic).push(item);
    });
    grouped.forEach((topicItems, topic) => {
      const section = document.createElement("section"); section.className = "study-topic";
      const topicTitle = document.createElement("h3"); topicTitle.textContent = topic; section.append(topicTitle);
      topicItems.forEach((item) => {
        const card = document.createElement("article"); card.className = "result-item";
        const heading = document.createElement("h4"); heading.textContent = item.id;
        const prompt = document.createElement("p"); prompt.className = "result-question"; prompt.textContent = item.question || "Question";
        const answer = document.createElement("p"); answer.className = "correct-answer";
        const answerLabel = document.createElement("strong"); answerLabel.textContent = "Expected answer: ";
        answer.append(answerLabel, document.createTextNode(item.expectedAnswer || "Review the related notes."));
        const points = document.createElement("p"); points.className = "result-feedback";
        const pointsLabel = document.createElement("strong"); pointsLabel.textContent = "Key points to remember: ";
        points.append(pointsLabel, document.createTextNode(item.summary || item.expectedAnswer || "Review the related notes."));
        card.append(heading, prompt, answer, points); section.append(card);
      });
      elements.result.append(section);
    });
    elements.previous.disabled = true; elements.next.disabled = true; elements.skip.disabled = true;
    elements.submit.disabled = true; elements.submit.textContent = "Study guide opened";
    elements.submitHint.textContent = "You are in study mode. Review the answers and key points below.";
    elements.studyGuide.disabled = true; elements.studyGuide.textContent = "Study guide opened";
    elements.grid.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    elements.answerArea.querySelectorAll("input,textarea").forEach((control) => { control.disabled = true; });
    elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function appendText(parent, className, label, value) {
    const p = document.createElement("p"); p.className = className;
    const strong = document.createElement("strong"); strong.textContent = `${label} `;
    p.append(strong, document.createTextNode(value || "Not provided.")); parent.append(p);
  }
  function renderResults(report) {
    submitted = true;
    const resultsById = new Map((report.results || []).map((item) => [item.id, item]));
    const counts = { correct: 0, partially_correct: 0, incorrect: 0, uncertain: 0, skipped: 0 };
    let score = 0;
    questions.forEach((question) => {
      const item = resultsById.get(question.id) || { status: "uncertain", awardedPoints: 0 };
      counts[item.status] = (counts[item.status] || 0) + 1; score += Number(item.awardedPoints) || 0;
    });
    score = Math.max(0, Math.min(100, score));
    elements.result.replaceChildren(); elements.result.hidden = false;
    const header = document.createElement("div"); header.className = "result-header";
    const intro = document.createElement("div");
    const kicker = document.createElement("p"); kicker.className = "section-kicker"; kicker.textContent = "APOLONIA AI / ASSESSMENT REPORT";
    const title = document.createElement("h2"); title.textContent = "Your assignment results";
    const summary = document.createElement("p"); summary.textContent = report.overallSummary || "Your answers have been evaluated against the assignment marking guide.";
    intro.append(kicker, title, summary);
    const ring = document.createElement("div"); ring.className = "score-ring";
    const ringInner = document.createElement("div");
    const scoreText = document.createElement("strong"); scoreText.textContent = `${score}%`;
    const scoreLabel = document.createElement("span"); scoreLabel.textContent = `${score} / 100`;
    ringInner.append(scoreText, scoreLabel); ring.append(ringInner); header.append(intro, ring); elements.result.append(header);
    const stats = document.createElement("div"); stats.className = "result-stats";
    [["Correct", counts.correct, "#83d6ae"], ["Partially correct", counts.partially_correct, "#f1c779"], ["Incorrect", counts.incorrect, "#ff9aa4"], ["Uncertain", counts.uncertain, "#b7c7db"], ["Skipped", counts.skipped, "#8bd8ed"]].forEach(([label, value, color]) => {
      const card = document.createElement("div"); card.className = "result-stat";
      const strong = document.createElement("strong"); strong.textContent = String(value); strong.style.color = color;
      const span = document.createElement("span"); span.textContent = label; card.append(strong, span); stats.append(card);
    });
    elements.result.append(stats);
    const feedback = document.createElement("div"); feedback.className = "result-summary";
    feedback.textContent = `Final score: ${score} / 100. Each question is worth 2 points. ${counts.skipped} question(s) were skipped and receive no points; their expected answers are shown below.`;
    elements.result.append(feedback);
    if (Array.isArray(report.topicsToImprove) && report.topicsToImprove.length) {
      const topics = document.createElement("div"); topics.className = "improve-topics";
      report.topicsToImprove.forEach((topic) => { const chip = document.createElement("span"); chip.className = "topic-chip"; chip.textContent = topic; topics.append(chip); });
      elements.result.append(topics);
    }
    const list = document.createElement("div"); list.className = "results-list";
    questions.forEach((question, index) => {
      const item = resultsById.get(question.id) || { status: "uncertain", awardedPoints: 0, feedback: "The evaluation service did not return a confident result for this answer.", correctAnswer: "Please review the relevant study notes." };
      const card = document.createElement("article"); card.className = "result-item";
      const head = document.createElement("div"); head.className = "result-item-head";
      const heading = document.createElement("h3"); heading.textContent = `Question ${String(index + 1).padStart(2, "0")} · ${item.awardedPoints || 0}/2`;
      const badge = document.createElement("span"); badge.className = `result-status ${item.status}`; badge.textContent = item.status.replaceAll("_", " ");
      head.append(heading, badge);
      const prompt = document.createElement("p"); prompt.className = "result-question"; prompt.textContent = question.prompt;
      card.append(head, prompt);
      appendText(card, "result-answer", "Your answer:", answers[question.id] || "");
      appendText(card, "result-feedback", "Apolonia AI feedback:", item.feedback || "No feedback was returned.");
      appendText(card, "correct-answer", "Expected answer:", item.correctAnswer || "See the relevant study notes.");
      list.append(card);
    });
    elements.result.append(list);
    const actions = document.createElement("div"); actions.className = "result-actions";
    const print = document.createElement("button"); print.type = "button"; print.textContent = "Print report"; print.addEventListener("click", () => window.print());
    const restart = document.createElement("button"); restart.type = "button"; restart.textContent = "Start a new attempt";
    restart.addEventListener("click", () => {
      if (!window.confirm("Start a new attempt? This will clear the answers saved on this device.")) return;
      localStorage.removeItem(STORAGE_KEY); window.location.reload();
    });
    actions.append(print, restart); elements.result.append(actions);
    elements.submit.disabled = true; elements.submit.textContent = "Assignment submitted";
    elements.submitHint.textContent = "Your evaluation is complete. Correct answers and feedback are now available below.";
    elements.previous.disabled = true; elements.next.disabled = true;
    elements.grid.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    elements.answerArea.querySelectorAll("input,textarea").forEach((control) => { control.disabled = true; });
    elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function submitAssignment() {
    if (submitting || submitted) return;
    const missing = questions.filter((question) => !String(answers[question.id] || "").trim() && !skipped.has(question.id));
    if (missing.length) {
      setStatus(`Please answer or skip every question. ${missing.length} question${missing.length === 1 ? "" : "s"} still need attention.`, "error");
      showQuestion(questions.indexOf(missing[0])); return;
    }
    if (!window.confirm("Submit your assignment for Apolonia AI evaluation? You will not be able to edit answers after submission. Correct answers will be revealed only after the evaluation.")) return;
    submitting = true; elements.submit.disabled = true; elements.submit.textContent = "Evaluating…";
    setStatus("Apolonia AI is reviewing all 50 answers. Please keep this page open.");
    try {
      const response = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ assignmentVersion: ASSIGNMENT_VERSION, answers: questions.map((question) => ({ id: question.id, answer: String(answers[question.id] || "").trim(), skipped: skipped.has(question.id) })) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The evaluation could not be completed. Your answers remain saved on this device.");
      if (!Array.isArray(data.results) || data.results.length !== questions.length) throw new Error("The evaluation response was incomplete. Your answers remain saved; please try again.");
      localStorage.removeItem(STORAGE_KEY); renderResults(data); setStatus("Assignment evaluated successfully.", "success");
    } catch (error) {
      setStatus(error.message || "A network error occurred. Your draft is safe; please try again.", "error");
      elements.submit.textContent = "Retry evaluation";
    } finally {
      submitting = false;
      if (!submitted) { elements.submit.disabled = completedCount() !== questions.length; elements.submit.textContent = "Submit assignment ↗"; }
    }
  }
  elements.previous.addEventListener("click", () => showQuestion(currentIndex - 1));
  elements.next.addEventListener("click", () => showQuestion(currentIndex + 1));
  elements.skip.addEventListener("click", () => {
    const question = questions[currentIndex];
    if (String(answers[question.id] || "").trim()) return;
    if (skipped.has(question.id)) skipped.delete(question.id);
    else skipped.add(question.id);
    saveDraft(); showQuestion(currentIndex);
    setStatus(skipped.has(question.id) ? "Question skipped. You can return to it at any time." : "Question restored to your assignment.");
  });
  elements.studyGuide.addEventListener("click", openStudyGuide);
  elements.submit.addEventListener("click", submitAssignment);
  loadDraft(); buildIndex(); showQuestion(0);
  setStatus(Object.keys(answers).length ? "Your saved draft has been restored on this device." : "Your progress will be saved automatically on this device.");
})();