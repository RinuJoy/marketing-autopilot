// To-do list: a day-by-day, tickable markdown list for one person, from apps/<app>/plan.json: the week themes,
// the dated tasks, the standing daily tasks, the posting slots (explicit calendar entries first, then queues that
// cycle), and the milestone tasks that wait for a day nobody can schedule (payments live, app public).
// Writes out/<app>/todo.md. Regenerate when the plan changes; ticks live in the copy a person keeps.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeText, outPath } from "../core/util.mjs";

const DAY = 864e5;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const at = iso => new Date(iso + "T00:00:00Z");
const iso = d => d.toISOString().slice(0, 10);
export const pretty = d => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

// Posting slots for one day: explicit calendar entries win; otherwise each slot whose weekday matches takes the
// next item of its queue (cycling, so a long plan never runs dry).
export function postsFor(plan, date, counters) {
  const day = iso(date), out = [];
  const fixed = (plan.calendar || []).filter(c => c.date === day);
  if (fixed.length) return fixed.map(c => ({ ...c }));
  for (const s of plan.slots || []) {
    if (s.from && day < s.from) continue;
    if (!s.days.includes(date.getUTCDay())) continue;
    const n = counters.get(s.id) || 0;
    counters.set(s.id, n + 1);
    const q = s.queue[n % s.queue.length];
    out.push({ date: day, time: s.time, where: s.where, what: s.what, file: q.file, caption: q.caption });
  }
  return out;
}

export function weekOf(plan, date) {
  const day = iso(date);
  let w = null;
  (plan.weeks || []).forEach((x, i) => { if (x.start <= day) w = { ...x, n: i + 1 }; });
  return w;
}

export function build(plan) {
  const from = at(plan.from), to = at(plan.to), counters = new Map();
  const dated = new Map();
  for (const t of plan.dated || []) dated.set(t.date, [...(dated.get(t.date) || []), t]);
  const lines = [`# ${plan.title}`, "", plan.intro, ""];
  if (plan.rules?.length) lines.push("## Rules for every post", "", ...plan.rules.map(r => `- ${r}`), "");
  if (plan.milestones?.length) lines.push("## Tick these on the day they happen", "", ...plan.milestones.map(m => `- [ ] ${m.task}`), "");
  let lastWeek = null, weekMinutes = 0, weekStart = null, days = 0, posts = 0;
  const closeWeek = () => { if (weekStart != null) lines.splice(weekStart, 0, `About ${Math.round(weekMinutes / 5) * 5} minutes of your time this week.`, ""); };
  for (let d = from; d <= to; d = new Date(d.getTime() + DAY)) {
    const w = weekOf(plan, d);
    if (w && w.n !== lastWeek?.n) {
      closeWeek();
      lines.push(`## Week ${w.n}: ${w.theme} (from ${pretty(at(w.start))})`, "", `Must happen this week: ${w.must}`, "");
      weekStart = lines.length; weekMinutes = 0; lastWeek = w;
    }
    const todo = [];
    for (const t of dated.get(iso(d)) || []) todo.push({ task: t.task, minutes: t.minutes || 0 });
    for (const p of postsFor(plan, d, counters)) {
      posts++;
      todo.push({ task: `${p.time} ${p.where}: ${p.what}, ${p.file} (caption: ${p.caption}). Scheduled? Then just read the comments`, minutes: 0 });
    }
    for (const t of plan.daily || []) if (t.days.includes(d.getUTCDay())) todo.push({ task: t.task, minutes: t.minutes || 0 });
    const mins = todo.reduce((a, t) => a + t.minutes, 0);
    weekMinutes += mins;
    days++;
    lines.push(`### ${pretty(d)}${mins ? ` (${mins} min)` : ""}`, "");
    if (!todo.length) lines.push("- [ ] Nothing. Rest.", "");
    else lines.push(...todo.map(t => `- [ ] ${t.task}${t.minutes ? ` (${t.minutes} min)` : ""}`), "");
  }
  closeWeek();
  if (plan.files?.length) lines.push("## Where the files are", "", ...plan.files.map(f => `- ${f}`), "");
  return { text: lines.join("\n"), days, posts };
}

export async function run(app) {
  const plan = JSON.parse(await readFile(join(app.dir, "plan.json"), "utf8"));
  const { text, days, posts } = build(plan);
  const file = await writeText(outPath(app.name, "todo.md"), text);
  return { summary: `${days} days, ${posts} posting slots, ${plan.from} to ${plan.to}`, files: [file], problems: [] };
}
