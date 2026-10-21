"""Fill React components with the original page markup.

A component marks where original markup belongs, and which parts React drives:

    // @markup #t-screen                          (or #id:inner, or page:home)
    //   slot screener  children {rows}           keep the element, React fills it
    //   slot lesson    replace  <Lesson />       swap the element for a component
    //   slot win       attrs    hidden={!x}      add or override attributes
    //   slot note      fallback {text}           React's content once it is not null, else the original
    //   slot chart     prepend  ref={r} :: {svg} extra attrs, and content before the original children
    //   wrap section.sec  Reveal as="section"    swap a tag for a component everywhere
    <>@MARKUP@</>

This script replaces the @MARKUP@ line with public/index.html's markup for that element,
converted to JSX by html2jsx.py, and turns the directive block into a one-line provenance
comment. It runs once per component; afterwards the file is ordinary JSX.

Usage: python3 fill_markup.py <component.jsx> [...]
"""
import re
import sys
from pathlib import Path

from html2jsx import convert, element

INDEX = Path(__file__).resolve().parents[2] / "public" / "index.html"
HTML = INDEX.read_text(encoding="utf-8")
BLOCK = re.compile(r"^(?P<ind>[ \t]*)// @markup (?P<src>\S+)\n(?P<body>(?:[ \t]*//[ \t]+(?:slot|wrap)\b.*\n)*)(?P<ind2>[ \t]*)<>@MARKUP@</>\n", re.M)


# What public/app.js decorateTools() inserted into each tool section at runtime.
TOOL_LEVELS = {
    "t-screen": (1, "What a company’s numbers mean, one tap at a time."),
    "t-chart": (2, "Read a price chart, its trend line and its momentum."),
    "t-mood": (1, "What the whole market did today, in one reading."),
    "t-position": (2, "Work out how many shares to buy before you buy them."),
    "t-options": (3, "See what an option trade pays before you place it."),
    "t-scanner": (2, "Find the stocks doing the things you have just learned."),
    "t-topo": (3, "Rank stocks by how independently they move."),
    "t-backtest": (3, "Test a rule, and split the result by the market’s state."),
    "t-portfolio": (3, "Check your own holdings for concentration a sector list hides."),
    "t-paper": (2, "Practise with virtual money, then read your own habits."),
}
LESSON_FOR_TOOL = {"t-screen": "b3", "t-chart": "m2", "t-mood": "b4", "t-position": "m3", "t-options": "a1",
                   "t-scanner": "m1", "t-topo": "a3", "t-backtest": "a3", "t-portfolio": "a3", "t-paper": "m4"}


def decorate(html, tool_id):
    from html import escape
    level, plain = TOOL_LEVELS[tool_id]
    head = html.index('class="tool-head"')
    label_end = html.index("</span>", html.index('class="mono-label"', head)) + len("</span>")
    html = html[:label_end] + f' <span class="level-badge">Stage {level}</span>' + html[label_end:]
    intro = html.index('<p class="tool-intro">')
    plain_p = (f'<p class="tool-plain"><b>In plain words:</b> {escape(plain, quote=False)} '
               f'<a href="#learn/l-{LESSON_FOR_TOOL[tool_id]}" class="practise">Read the lesson first →</a></p>')
    return html[:intro] + plain_p + html[intro:]


def source(src):
    if src.endswith("+decorate"):
        base = src[: -len("+decorate")]
        return decorate(source(base), base[1:])
    if src.startswith("page:"):
        el = element(HTML, f'<div class="page" data-page="{src[5:]}"' + (">" if src[5:] == "home" else " hidden>"))
        return re.sub(r"^<div[^>]*>|</div>\s*$", "", el.strip())
    inner = src.endswith(":inner")
    sid = src[1:].replace(":inner", "")
    m = re.search(rf'<([a-zA-Z0-9]+)\b[^>]*\bid="{re.escape(sid)}"[^>]*>', HTML)
    if not m:
        raise SystemExit(f"no element with id={sid}")
    el = element(HTML, m.group(0))
    if inner:
        el = el[len(m.group(0)):el.rindex("</")]
    return el


def parse(body):
    slots, transforms = {}, []
    for line in body.splitlines():
        line = line.strip()[2:].strip()
        kw, rest = line.split(None, 1)
        if kw == "slot":
            sid, kind, payload = rest.split(None, 2)
            slots[sid] = (kind, payload)
        else:
            sel, comp = rest.split(None, 1)
            tag, _, cls = sel.partition(".")
            name, _, extra = comp.partition(" ")
            transforms.append((tag, cls or None, name, extra.strip()))
    return slots, transforms


def fill(path):
    text = Path(path).read_text(encoding="utf-8")
    count = 0

    def sub(m):
        nonlocal count
        count += 1
        slots, transforms = parse(m.group("body"))
        src_html = source(m.group("src"))
        missing = [sid for sid in slots if f'id="{sid}"' not in src_html]
        if missing:
            raise SystemExit(f"{path}: slot id(s) not in {m.group('src')}: {missing}")
        ind = m.group("ind2")
        jsx = convert(src_html, slots, len(ind) // 2, transforms)
        frag = jsx if _single_root(jsx) else "<>\n" + ind + "  " + jsx.replace("\n", "\n  ") + "\n" + ind + "</>"
        return f"{m.group('ind')}// markup: public/index.html {m.group('src')} (filled by v2/tools/fill_markup.py)\n{ind}{frag}\n"

    out = BLOCK.sub(sub, text)
    if not count:
        raise SystemExit(f"{path}: no @markup block")
    Path(path).write_text(out, encoding="utf-8")
    print(f"{path}: {count} block(s) filled")


def _single_root(jsx):
    depth = 0
    for m in re.finditer(r"<(/?)([A-Za-z][\w.]*)[^<>]*?(/?)>", jsx):
        if m.group(3) == "/":
            if depth == 0:
                return m.end() == len(jsx)
            continue
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return m.end() == len(jsx.rstrip())
    return False


if __name__ == "__main__":
    for p in sys.argv[1:]:
        fill(p)
