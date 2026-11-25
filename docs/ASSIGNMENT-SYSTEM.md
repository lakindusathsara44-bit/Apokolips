# Apokolips Assignment and Notes System

## Assignment
`assignment.html` contains 50 Information Systems questions across four difficulty levels: 12 Easy, 13 Medium, 13 Hard and 12 Very Hard. The public question bank remains in `assets/assignment/questions.js`.

## Local-only behaviour
`assets/assignment/assignment.js` handles question navigation, multiple-choice and written responses, skip/unskip, progress display and browser local-storage autosave. No answers are sent to an evaluation API. The Submit Assignment and “I can't answer — show answers & summaries” actions save the current draft and navigate to `notes.html`; neither action grades or uploads the attempt. A question and topic identifier are included in the URL when a student opens notes from the assignment.

## Learning notes
- `notes.html` is the separate notes interface.
- `assets/notes/notes-data.js` contains the topic-based learning content.
- `assets/notes/notes.css` contains responsive styling.
- `assets/notes/notes.js` implements topic navigation, search, expandable sections and question cross-links.

The notes are organized from readable content in the 28 supplied `IMG-20261125-WA*.jpg` lecture-note photographs. Unclear handwriting was not used as a factual premise. Explanations and examples clarify the legible concepts; they are not a verbatim transcription or an official lecturer-issued answer key.

## Privacy and limitations
Draft answers and skipped-question choices are stored only in the student's current browser under a versioned local-storage key. They are not uploaded or stored in an application database. Clearing browser/site data can remove this local draft, so students should keep their browser data if they want to retain it.

The Assignment workflow does not use OpenAI, Gemini, Groq, API keys, remote evaluation endpoints or AI-generated runtime answers. There is no automatic score or grading report; the Notes page is a learning resource.

## Difficulty distribution
| Level | Questions |
|---|---:|
| Easy | 12 |
| Medium | 13 |
| Hard | 13 |
| Very Hard | 12 |
| **Total** | **50** |
