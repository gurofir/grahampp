'use strict';

const Anthropic = require('@anthropic-ai/sdk').default;
const { streamWithDeadline, tryParseJson } = require('./aiPrompt');

// Storyteller LLM
// ----------------
// Takes Graham++'s analytical output and rewrites it as a short, plain-language
// summary aimed at a non-economist user. This is a SEPARATE call from the
// synthesis engine on purpose — asking one model to be both rigorous analyst
// and warm storyteller in the same call usually waters both down.
// Failure is non-fatal: callers should fall back to the analytical text.

const BANNED_HE = [
  'מכפיל', 'מכפיל רווח', 'מכפיל מכירות', 'מכפיל צמיחה', 'מכפיל עתידי',
  'EBITDA', 'FCF', 'ROIC', 'ROE', 'EPS', 'PEG', 'P/E', 'P/S',
  'מרווח ביטחון', 'תזרים מזומנים חופשי', 'תשואת תזרים',
  'תשואה על ההון', 'תשואה על ההון המושקע',
  'כיסוי ריבית', 'יחס שוטף', 'חוב נטו ל-EBITDA',
  'מרווח גולמי', 'מרווח תפעולי', 'מרווח נקי',
  'intrinsic', 'fair value', 'ערך פנימי',
];

const BANNED_EN = [
  'P/E', 'EBITDA', 'FCF', 'ROIC', 'ROE', 'EPS', 'PEG', 'P/S',
  'multiple', 'multiples', 'free cash flow', 'margin of safety',
  'interest coverage', 'current ratio', 'net debt to EBITDA',
  'gross margin', 'operating margin', 'net margin',
  'intrinsic value', 'fair value',
];

function buildPromptHe(graham) {
  const banned = BANNED_HE.join(', ');
  return `אתה ה-STORYTELLER. המשימה היחידה שלך: לתרגם המלצת מניה של Graham++ לעברית פשוטה שכל אדם יכול לקלוט מיד. דבר כמו חבר שמבין במניות ומסביר על כוס קפה.

TARGET LANGUAGE: HEBREW. עברית רהוטה ותקנית בלבד. אסור אנגלית באמצע משפט.

אסור מוחלט — המילים האלה אסורות בפלט שלך:
${banned}

מותר במקום:
- "המחיר זול" / "יקר" / "הוגן"
- "החובות בשליטה" / "יש חובות גבוהים" / "מתקשים לשלם ריבית"
- "החברה מרוויחה הרבה" / "הרווחיות נשחקת"
- "צומחים מהר" / "הצמיחה האטה"
- "הסקטור עולה ויורד עם הכלכלה"

עקרונות:
1. פעלים במקום מספרים. מספר אחד מותר אם הוא דרמטי, אחרת לא.
2. תמונות קונקרטיות, לא טכניות.
3. אינסטינקט לצד הגיון — שדה "feel" הוא הקריאה הרגשית.
4. קצר. אדם רגיל לא קורא יותר משלושה משפטים.

מגבלות אורך (קשיחות):
- verdict: עד 6 מילים. למשל "כדאי לקנות בקטן" / "תחכו עוד" / "לא שווה".
- headline: עד 14 מילים, משפט אחד שתופס את הסיפור.
- story: 2-3 משפטים, עד 60 מילים סך הכל.
- feel: עד 6 מילים. למשל "מרגיש סולידי", "מרגיש הימור", "יש משהו פה", "מסוכן מדי".
- redFlags: 0-3 פריטים, כל אחד עד 14 מילים בעברית פשוטה.

ההמלצה של Graham++:
- החלטה: ${graham.decision || ''}
- ביטחון: ${graham.confidence || ''}
- תזה אנליטית: ${graham.thesis || ''}
- למה: ${(graham.why || []).join(' | ')}
- סיכונים: ${(graham.risks || []).join(' | ')}
- טריגר למעקב: ${graham.trigger || ''}
- טיעון נגדי פנימי: ${graham.counter?.summary || ''}

החזר JSON תקין בלבד (ללא markdown, ללא טקסט נוסף):
{
  "verdict": "עד 6 מילים",
  "headline": "עד 14 מילים, משפט אחד",
  "story": "2-3 משפטים, עד 60 מילים",
  "feel": "עד 6 מילים, קריאה רגשית",
  "redFlags": ["משפט פשוט", "משפט פשוט"]
}`;
}

function buildPromptEn(graham) {
  const banned = BANNED_EN.join(', ');
  return `You are the STORYTELLER. Your single job: translate one Graham++ stock recommendation into plain English a non-economist can grasp instantly. Speak like a knowledgeable friend explaining over coffee.

TARGET LANGUAGE: ENGLISH.

ABSOLUTE PROHIBITIONS — banned words/phrases:
${banned}
No financial acronyms whatsoever.

USE INSTEAD:
- "the price is cheap / expensive / fair"
- "debt is under control" / "debt is heavy" / "they struggle to pay interest"
- "they make solid money" / "profitability is eroding"
- "growing fast" / "growth has slowed"
- "the sector rides the economy"

PRINCIPLES:
1. Verbs over numbers. One number is allowed if it is dramatic ("price fell 40%"); otherwise none.
2. Concrete pictures, not technical phrases.
3. Instinct alongside logic — the "feel" field is the emotional read.
4. Short. A regular reader will not get past three sentences.

LENGTH LIMITS (HARD):
- verdict: ≤6 words. e.g. "Worth buying a little" / "Wait it out" / "Not worth it".
- headline: ≤14 words, single sentence, the gist.
- story: 2-3 sentences, ≤60 words total.
- feel: ≤6 words emotional read. e.g. "Feels solid", "Feels like a gamble", "Something is there", "Too risky".
- redFlags: 0-3 items, ≤14 words each, plain language.

THE GRAHAM++ RECOMMENDATION:
- Decision: ${graham.decision || ''}
- Confidence: ${graham.confidence || ''}
- Analytical thesis: ${graham.thesis || ''}
- Why: ${(graham.why || []).join(' | ')}
- Risks: ${(graham.risks || []).join(' | ')}
- Trigger to watch: ${graham.trigger || ''}
- Internal counter-thesis: ${graham.counter?.summary || ''}

Return ONLY valid JSON (no markdown, no prose):
{
  "verdict": "≤6 words",
  "headline": "≤14 words, one sentence",
  "story": "2-3 sentences, ≤60 words",
  "feel": "≤6 words, emotional read",
  "redFlags": ["plain sentence", "plain sentence"]
}`;
}

function clamp(s, max) {
  if (typeof s !== 'string') return '';
  const trimmed = s.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function normalize(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const verdict = clamp(parsed.verdict, 80);
  const headline = clamp(parsed.headline, 140);
  const story = clamp(parsed.story, 320);
  const feel = clamp(parsed.feel, 60);
  if (!verdict || !headline || !story) return null;
  const redFlags = Array.isArray(parsed.redFlags)
    ? parsed.redFlags
        .filter((s) => typeof s === 'string' && s.trim())
        .slice(0, 3)
        .map((s) => clamp(s, 140))
    : [];
  return { verdict, headline, story, feel, redFlags };
}

async function runStoryteller({ apiKey, model, graham, lang, deadlineMs = 12000 }) {
  if (!apiKey || !graham || !graham.decision) return null;
  try {
    const client = new Anthropic({ apiKey, timeout: deadlineMs + 1000, maxRetries: 0 });
    const prompt = lang === 'en' ? buildPromptEn(graham) : buildPromptHe(graham);
    const result = await streamWithDeadline({
      client,
      model,
      prompt,
      maxTokens: 700,
      deadlineMs,
    });
    return {
      summary: normalize(tryParseJson(result.text)),
      stoppedEarly: result.stoppedEarly,
      elapsedMs: result.elapsedMs,
      len: result.text.length,
    };
  } catch (err) {
    console.error('[storyteller] failed:', err && err.message);
    return null;
  }
}

module.exports = { runStoryteller };
