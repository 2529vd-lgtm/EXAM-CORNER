# Exam Corner

Divyanshu's **Exam Corner**: each exam has a countdown, its syllabus, and subject-wise long notes, short notes, mind maps, PYQs and mock tests.

Blogs, stories, editorials and reports live on the main website: https://2529vd-lgtm.github.io/DIVYANSHU/

It's a plain HTML/CSS/JS site hosted free on GitHub Pages. There's no server and no build step.

Live site (after GitHub Pages is turned on for this repo): https://2529vd-lgtm.github.io/EXAM-CORNER/

## Adding content (no coding needed)

Open **`/admin.html`** on the live site (or use the "Admin" link in the footer) and log in with a GitHub token. The login box has step-by-step instructions for creating the token. After that you can:

- **🎯 Exams:** add an exam with its date (shown as a countdown), syllabus and subjects.
- **📚 Study Material:** add Long Notes, Short Notes, Mind Maps, PYQs or Mock Tests to any exam subject. You can paste many mock-test questions at once.
- **🔗 Social & Settings:** add your social media links (each shows its logo on the site), your photo and your About text.

Every save becomes a commit in this repo. The live site updates 1–2 minutes later.

## Where things live

| Path | What it is |
|---|---|
| `index.html` | Home page: exam ticker, upcoming and past exams with countdowns, About |
| `exam.html` | Exam page: syllabus and subject-wise study material |
| `item.html` | Reader for notes, mind maps and PYQs |
| `mock.html` | Timed mock test with scoring and answer review |
| `admin.html` | Upload and edit everything |
| `content/` | All content: `site.json`, `exams.json`, `exam-items.json`, plus the notes and mock-test files |
| `uploads/` | Photos and PDFs uploaded from the Admin page |
| `js/config.js` | Repo/branch used by Admin, link to the main blog, study-material types, social platforms |
| `js/vendor/` | Bundled libraries: marked, DOMPurify, d3 and markmap (for mind maps) |

## Writing tips

Notes use Markdown. The Admin toolbar inserts the syntax for you.

- **Mind map:** start with `# Topic`, then `## Branch`, then `- point` lines underneath. Or upload an image instead.
- **PYQ:** use the **🙈 Answer** button to hide an answer until the reader clicks it.

## View it locally

The pages load content with `fetch`, so open them through a local server instead of double-clicking the files:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Credits

Social media icons are from [Font Awesome Free](https://fontawesome.com), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Bundled libraries in `js/vendor/`: [marked](https://github.com/markedjs/marked) (MIT), [DOMPurify](https://github.com/cure53/DOMPurify) (Apache-2.0 / MPL-2.0), [d3](https://d3js.org) (ISC) and [markmap](https://markmap.js.org) (MIT).
