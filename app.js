"use strict";

const STORAGE_KEY = "flashcards.deck";

const STATUS_LABELS = {
  new: "New",
  known: "Known",
  learning: "Still learning",
};

// App state
let cards = [];
let editingId = null;
let review = null; // { queue, index, flipped, known, learning }

// DOM references
const els = {
  startReview: document.getElementById("start-review"),
  deckView: document.getElementById("deck-view"),
  form: document.getElementById("card-form"),
  formTitle: document.getElementById("form-title"),
  questionInput: document.getElementById("question-input"),
  answerInput: document.getElementById("answer-input"),
  submitBtn: document.getElementById("submit-btn"),
  cancelEdit: document.getElementById("cancel-edit"),
  deckStats: document.getElementById("deck-stats"),
  emptyMessage: document.getElementById("empty-message"),
  cardList: document.getElementById("card-list"),
  reviewView: document.getElementById("review-view"),
  reviewSession: document.getElementById("review-session"),
  reviewProgress: document.getElementById("review-progress"),
  exitReview: document.getElementById("exit-review"),
  flashcard: document.getElementById("flashcard"),
  cardQuestion: document.getElementById("card-question"),
  cardAnswer: document.getElementById("card-answer"),
  flipHint: document.getElementById("flip-hint"),
  markActions: document.getElementById("mark-actions"),
  markKnown: document.getElementById("mark-known"),
  markLearning: document.getElementById("mark-learning"),
  reviewSummary: document.getElementById("review-summary"),
  summaryText: document.getElementById("summary-text"),
  reviewAgain: document.getElementById("review-again"),
  backToDeck: document.getElementById("back-to-deck"),
};

/* ---------- Storage ---------- */

// Loads the deck from localStorage, returning an empty deck if nothing is saved or the data is unreadable.
function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Could not load saved deck:", err);
    return [];
  }
}

// Saves the current deck to localStorage.
function saveCards() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch (err) {
    console.warn("Could not save deck:", err);
  }
}

// Generates a unique id for a new card.
function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Deck view ---------- */

// Builds a small button element with the given label and extra class names.
function makeButton(label, className) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-small " + (className || "");
  btn.textContent = label;
  return btn;
}

// Builds the list item for one card, including its status badge and Edit/Delete buttons.
function renderCardItem(card) {
  const li = document.createElement("li");
  li.className = "card-item" + (card.id === editingId ? " is-editing" : "");

  const body = document.createElement("div");
  body.className = "card-item-body";
  const q = document.createElement("p");
  q.className = "card-item-question";
  q.textContent = card.question;
  const a = document.createElement("p");
  a.className = "card-item-answer";
  a.textContent = card.answer;
  body.append(q, a);

  const side = document.createElement("div");
  side.className = "card-item-side";
  const badge = document.createElement("span");
  badge.className = "badge badge-" + card.status;
  badge.textContent = STATUS_LABELS[card.status] || STATUS_LABELS.new;

  const buttons = document.createElement("div");
  buttons.className = "card-item-buttons";
  const editBtn = makeButton("Edit");
  editBtn.addEventListener("click", () => startEdit(card.id));
  const deleteBtn = makeButton("Delete", "btn-danger");
  deleteBtn.addEventListener("click", () => deleteCard(card.id));
  buttons.append(editBtn, deleteBtn);

  side.append(badge, buttons);
  li.append(body, side);
  return li;
}

// Redraws the card list, the deck stats line, and the Start review button state.
function renderDeck() {
  els.cardList.replaceChildren(...cards.map(renderCardItem));

  const known = cards.filter((c) => c.status === "known").length;
  const learning = cards.filter((c) => c.status === "learning").length;
  const noun = cards.length === 1 ? "card" : "cards";
  els.deckStats.textContent = cards.length
    ? `${cards.length} ${noun} · ${known} known · ${learning} still learning`
    : "";

  els.emptyMessage.hidden = cards.length > 0;
  els.startReview.disabled = cards.length === 0;
}

// Handles the form submit: adds a new card, or saves changes to the card being edited.
function handleFormSubmit(event) {
  event.preventDefault();
  const question = els.questionInput.value.trim();
  const answer = els.answerInput.value.trim();
  if (!question || !answer) return;

  if (editingId) {
    const card = cards.find((c) => c.id === editingId);
    if (card) {
      card.question = question;
      card.answer = answer;
    }
    resetForm();
  } else {
    cards.push({ id: createId(), question, answer, status: "new" });
    els.form.reset();
    els.questionInput.focus();
  }

  saveCards();
  renderDeck();
}

// Puts the form into edit mode, filled with the chosen card's question and answer.
function startEdit(id) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;

  editingId = id;
  els.questionInput.value = card.question;
  els.answerInput.value = card.answer;
  els.formTitle.textContent = "Edit card";
  els.submitBtn.textContent = "Save changes";
  els.cancelEdit.hidden = false;
  renderDeck();

  els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  els.questionInput.focus();
}

// Returns the form to "Add a card" mode and clears its fields.
function resetForm() {
  editingId = null;
  els.form.reset();
  els.formTitle.textContent = "Add a card";
  els.submitBtn.textContent = "Add card";
  els.cancelEdit.hidden = true;
}

// Cancels editing without saving changes.
function cancelEdit() {
  resetForm();
  renderDeck();
}

// Deletes a card after the user confirms.
function deleteCard(id) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  if (!confirm(`Delete this card?\n\n"${card.question}"`)) return;

  cards = cards.filter((c) => c.id !== id);
  if (editingId === id) resetForm();
  saveCards();
  renderDeck();
}

/* ---------- Review mode ---------- */

// Starts a review session that goes through every card in the deck.
function startReview() {
  if (cards.length === 0) return;
  if (editingId) resetForm();

  review = {
    queue: cards.map((c) => c.id),
    index: 0,
    flipped: false,
    known: 0,
    learning: 0,
  };

  els.deckView.hidden = true;
  els.startReview.hidden = true;
  els.reviewView.hidden = false;
  els.reviewSummary.hidden = true;
  els.reviewSession.hidden = false;
  showReviewCard();
}

// Shows the current review card question-side up and updates the progress text.
function showReviewCard() {
  const card = cards.find((c) => c.id === review.queue[review.index]);
  if (!card) {
    // The card no longer exists; skip it.
    advanceReview();
    return;
  }

  review.flipped = false;
  els.flashcard.classList.remove("is-flipped");
  els.cardQuestion.textContent = card.question;
  els.cardAnswer.textContent = card.answer;
  els.reviewProgress.textContent = `Card ${review.index + 1} of ${review.queue.length}`;
  els.markActions.hidden = true;
  els.flipHint.hidden = false;
}

// Flips the current review card between question and answer.
function flipCard() {
  if (!review || !els.reviewSummary.hidden) return;

  review.flipped = !review.flipped;
  els.flashcard.classList.toggle("is-flipped", review.flipped);

  // Once the answer has been seen, show the Known / Still learning buttons.
  if (review.flipped) {
    els.markActions.hidden = false;
    els.flipHint.hidden = true;
  }
}

// Records the current card as known or still learning, then moves to the next card.
function markCard(status) {
  if (!review || els.markActions.hidden) return;

  const card = cards.find((c) => c.id === review.queue[review.index]);
  if (card) {
    card.status = status;
    saveCards();
  }
  if (status === "known") review.known += 1;
  else review.learning += 1;

  advanceReview();
}

// Moves to the next card in the session, or shows the summary when the deck is finished.
function advanceReview() {
  review.index += 1;
  if (review.index >= review.queue.length) {
    showSummary();
  } else {
    showReviewCard();
  }
}

// Shows the end-of-session summary with known / still learning counts.
function showSummary() {
  els.reviewSession.hidden = true;
  els.reviewSummary.hidden = false;
  els.summaryText.textContent =
    `You marked ${review.known} as known and ${review.learning} as still learning.`;
  els.reviewAgain.focus();
}

// Leaves review mode and returns to the deck list.
function exitReview() {
  review = null;
  els.reviewView.hidden = true;
  els.deckView.hidden = false;
  els.startReview.hidden = false;
  renderDeck();
}

// Handles keyboard input: Space flips the card while reviewing.
function handleKeydown(event) {
  if (!review || els.reviewView.hidden || !els.reviewSummary.hidden) return;
  if (event.code === "Space" || event.key === " ") {
    event.preventDefault();
    flipCard();
  }
}

/* ---------- Setup ---------- */

// Wires up event listeners and renders the saved deck on page load.
function init() {
  cards = loadCards();

  els.form.addEventListener("submit", handleFormSubmit);
  els.cancelEdit.addEventListener("click", cancelEdit);
  els.startReview.addEventListener("click", startReview);
  els.exitReview.addEventListener("click", exitReview);
  els.flashcard.addEventListener("click", flipCard);
  els.markKnown.addEventListener("click", () => markCard("known"));
  els.markLearning.addEventListener("click", () => markCard("learning"));
  els.reviewAgain.addEventListener("click", startReview);
  els.backToDeck.addEventListener("click", exitReview);
  document.addEventListener("keydown", handleKeydown);

  renderDeck();
}

init();
