# Apokolips Assignment System

## Overview

`assignment.html` is the interactive Information Systems assignment page. It contains 50 questions across four difficulty levels (12 Easy, 13 Medium, 13 Hard, 12 Very Hard). Every question is worth 2 points, for a total of 100.

## Source-note basis

The question set was authored from the educational photographs in the repository whose names begin with `IMG-20261125-WA`. OCR was run against all 28 matching photographs. The readable material covers:

- Information systems: definition, purpose, components, and the input–processing–output–feedback model
- Data and information; hardware, software, data management, networking, and telecommunications
- Organizational, management, and technology dimensions
- TPS, MIS, DSS, and ESS/EIS and their management-level use
- Business processes and functional areas: production/manufacturing, sales and marketing, finance and accounting, and human resources
- Information quality: accuracy, integrity, consistency, completeness, and validity
- Benefits and organizational objectives of information systems

Some handwriting in the photographs is unclear. Questions were limited to concepts that could be read with reasonable confidence; unclear fragments were not used as factual premises.

### Images reviewed

- `IMG-20261125-WA0008.jpg`
- `IMG-20261125-WA0009.jpg`
- `IMG-20261125-WA0010.jpg`
- `IMG-20261125-WA0011.jpg`
- `IMG-20261125-WA0012.jpg`
- `IMG-20261125-WA0013.jpg`
- `IMG-20261125-WA0014.jpg`
- `IMG-20261125-WA0015.jpg`
- `IMG-20261125-WA0016.jpg`
- `IMG-20261125-WA0017.jpg`
- `IMG-20261125-WA0018.jpg`
- `IMG-20261125-WA0019.jpg`
- `IMG-20261125-WA0020.jpg`
- `IMG-20261125-WA0021.jpg`
- `IMG-20261125-WA0022.jpg`
- `IMG-20261125-WA0027.jpg`
- `IMG-20261125-WA0038.jpg`
- `IMG-20261125-WA0050.jpg`
- `IMG-20261125-WA0055.jpg`
- `IMG-20261125-WA0061.jpg`
- `IMG-20261125-WA0077.jpg`
- `IMG-20261125-WA0089.jpg`
- `IMG-20261125-WA0106.jpg`
- `IMG-20261125-WA0116.jpg`
- `IMG-20261125-WA0137.jpg`
- `IMG-20261125-WA0140.jpg`
- `IMG-20261125-WA0150.jpg`
- `IMG-20261125-WA0152.jpg`

## Frontend structure

- `assignment.html` — SEO metadata and semantic page shell
- `assets/assignment/questions.js` — public question text/options only; contains no expected answers
- `assets/assignment/assignment.js` — navigation, required-answer checks, local autosave, submission, and results rendering
- `assets/assignment/assignment.css` — responsive Apokolips dark/blue/cyan interface

Draft answers are saved in browser local storage under a versioned key. The page does not request a student name or email and does not save submissions to an application database. Correct answers are not shipped to the browser before submission.

## Apolonia AI evaluation endpoint

`netlify/functions/assignment-evaluate.mjs` implements `POST /api/assignment/evaluate` on the existing `apolonia-ai-api` Netlify site.

- Expected answers and marking guides are stored as an AES-256-GCM encrypted payload in `netlify/lib/assignment-rubric.enc.mjs`; the decryption key is not committed to the repository and must be configured as a Netlify secret.
- The endpoint requires exactly 50 unique, non-empty answers for the current assignment version.
- Each question is scored from 0 to 2 points; the maximum is 100.
- The model is instructed to evaluate meaning, not exact wording, and to use `uncertain` rather than guess.
- The server normalizes and validates every returned result and supplies the trusted expected answer from its own marking rubric.
- Student answer text and provider credentials are not written to application logs.
- OpenAI calls use `store: false`. The page itself does not persist submissions on a server.
- CORS is restricted to `https://apokolips.xyz` and `https://www.apokolips.xyz`.
- Netlify per-IP rate limiting is configured to 4 requests per 60 seconds.

### Runtime configuration

The function requires the private rubric decryption secret below, plus at least one AI provider key. It reuses the server-side provider environment variables already used by the APOLONIA chat function:

1. `GROQ_API_KEY`
2. `GEMINI_API_KEY`
3. `OPENAI_API_KEY`
4. `OPENAI_API_KEY_2` (optional fallback)

Configure `APOKOLIPS_ASSIGNMENT_RUBRIC_KEY` and at least one provider key as secret environment variables on the `apolonia-ai-api` Netlify site. Never add either secret to browser JavaScript or commit it to Git. The rubric key must be the private base64 key supplied to the repository owner for this deployment.

The frontend automatically routes a Netlify deploy preview to the matching `apolonia-ai-api` deploy preview; production uses `https://apolonia-ai-api.netlify.app`. If the production API domain changes, update `API_ORIGIN` in `assets/assignment/assignment.js`.

## Deployment

The repository's existing PR #195 established the Assignment page and confirmed the `apolonia-ai-api` Netlify deploy-preview integration. The new evaluator function must be deployed to that Netlify site for AI evaluation to work. A GitHub preview build of the static Apokolips site alone does not deploy the API function unless the Netlify API project is also connected to the same repository/branch.

## Privacy and limitations

- Answers are transmitted to the configured AI provider only when the student confirms submission.
- No name, email, or other student identifier is requested or transmitted.
- The assignment UI keeps an unsent draft only in the student's current browser.
- CORS and rate limits reduce casual abuse but are not user authentication. A public assignment can be submitted anonymously.
- AI scoring is an assisted assessment, not a substitute for lecturer review. Answers returned as `uncertain` should be manually checked.
