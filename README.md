# QFA Regulation Practice

A practice quiz for the QFA **Regulation** module (Professional Diploma in Financial Advice, Ireland).
It runs entirely in the browser, can be added to a phone's home screen, and works offline once opened.

> Unofficial practice questions for personal study. Not affiliated with or endorsed by the
> Institute of Banking (IOB). The questions were written with AI assistance and may contain errors.
> Always check the current IOB course text — rules, figures and thresholds change.

## What it covers

274 multiple-choice questions across 7 topics:

| Topic | Questions |
|---|---|
| Why financial service providers are regulated | 40 |
| Authorisation | 37 |
| Minimum Competency Code | 40 |
| Consumer Protection Code | 40 |
| Data protection | 40 |
| Money laundering and terrorist financing | 39 |
| MiFID | 38 |

Consumer Protection Code questions cover both the 2012 code and the revised code that applied
from 24 March 2026, and name which one where they differ.

## Features

- **Practice** one topic or a mix, with the correct answer, an explanation and a reference after each question
- **Mistake review**: wrong answers are remembered; a question is cleared after two correct answers in a row in review mode
- **Mock exam**: timed, no feedback until the end, 60% pass mark, per-topic breakdown
- Star any question to revisit it, light and dark theme, keyboard shortcuts (1–4 or A–D, Enter for next)

## Using it

Open the site's address in a browser. With GitHub Pages the address is
`https://<username>.github.io/<repository-name>/`.

### Add to an iPhone home screen

1. Open the address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it once from the new icon while online. After that it works without a connection.

### Add to an Android phone

Open the address in Chrome, tap the **⋮** menu, then **Add to Home screen** (or **Install app**).

## Your progress

- Progress is stored **in the browser on each device**. Nothing is sent anywhere.
- A phone and a computer each keep their own progress. Use **Export** and **Import** in the app to move it between them.
- Clearing the browser's site data, or removing the home-screen app, deletes the progress on that device. Export first if you want to keep it.

## Publishing on GitHub Pages

1. Upload all files in this folder to the top level of a public repository.
2. Go to **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. Wait a minute or two for the address shown on that page to go live.

## Files

| File | Purpose |
|---|---|
| `index.html`, `app.js`, `styles.css` | The quiz interface |
| `questions.json` | All questions, with answers, explanations and references |
| `static-api.js` | Loads the questions and saves progress in the browser |
| `sw.js` | Offline cache |
| `manifest.webmanifest`, `icon-*.png` | Home-screen name and icon |

## Editing questions

Each question in `questions.json` looks like this (`answer` is the position of the correct option, counting from 0):

```json
{
  "id": "mcc-001",
  "topic": "mcc",
  "subtopic": "CPD",
  "difficulty": "easy",
  "question": "…",
  "options": ["…", "…", "…", "…"],
  "answer": 2,
  "explanation": "…",
  "reference": "…"
}
```

After changing the file, upload it again. Devices pick up the new version the next time the app is opened online.
