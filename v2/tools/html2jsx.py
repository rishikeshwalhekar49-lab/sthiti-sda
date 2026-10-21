"""Convert fragments of the original public/index.html into JSX, mechanically.

Used once, to build the v2 React pages without retyping any of the original markup:
every static word, class, id, link and inline SVG is carried over by this script.
The dynamic regions that public/app.js used to fill in by element id are replaced by
React components through `slots`:

    slots = {
      "someId": ("replace", "<Component />"),        # swap the whole element
      "someId": ("children", "{expression}"),        # keep the element, swap its contents
      "someId": ("attrs", {"hidden": "{!x}"}),       # keep it, add/override attributes
    }

Whitespace follows HTML rendering: runs collapse to one space, and whitespace-only
text containing a line break (indentation between block elements) is dropped.
"""
import re
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
ATTR = {
    "class": "className", "for": "htmlFor", "tabindex": "tabIndex", "colspan": "colSpan", "rowspan": "rowSpan",
    "spellcheck": "spellCheck", "inputmode": "inputMode", "readonly": "readOnly", "maxlength": "maxLength",
    "crossorigin": "crossOrigin", "autocomplete": "autoComplete", "autofocus": "autoFocus", "datetime": "dateTime",
    "srcset": "srcSet", "novalidate": "noValidate", "contenteditable": "contentEditable",
    # SVG (html.parser lower-cases attribute names)
    "viewbox": "viewBox", "preserveaspectratio": "preserveAspectRatio", "text-anchor": "textAnchor",
    "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin",
    "stroke-dasharray": "strokeDasharray", "stroke-opacity": "strokeOpacity", "fill-opacity": "fillOpacity",
    "fill-rule": "fillRule", "clip-path": "clipPath", "clip-rule": "clipRule", "font-size": "fontSize",
    "font-family": "fontFamily", "font-weight": "fontWeight", "dominant-baseline": "dominantBaseline",
    "stop-color": "stopColor", "stop-opacity": "stopOpacity", "vector-effect": "vectorEffect",
}
BOOL = {"hidden", "disabled", "checked", "selected", "open", "required", "multiple", "autofocus", "readonly", "novalidate"}


class Node:
    def __init__(self, tag, attrs=None, parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, attrs or [], parent, []


class Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def esc_text(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace("{", "&#123;").replace("}", "&#125;"))


def camel(prop):
    if prop.startswith("--"):
        return repr(prop)
    head, *rest = prop.split("-")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


def style_obj(css):
    items = []
    for decl in css.split(";"):
        if ":" not in decl:
            continue
        k, v = decl.split(":", 1)
        items.append(f"{camel(k.strip())}: {v.strip()!r}".replace("'", '"'))
    return "{{ " + ", ".join(items) + " }}"


def attrs_jsx(tag, attrs, override=None):
    out = {}
    for k, v in attrs:
        if k == "style":
            out["style"] = style_obj(v or "")
            continue
        name = ATTR.get(k, k)
        if tag in ("input", "textarea") and k == "value":
            name = "defaultValue"
        if tag == "input" and k == "checked":
            name = "defaultChecked"
        if v is None:
            out[name] = None if k in BOOL else '""'
        else:
            out[name] = '"' + v.replace('"', "&quot;") + '"'
    if isinstance(override, str):          # raw JSX attributes, e.g. 'hidden={!x} className={c}'
        for name in re.findall(r"([A-Za-z_][\w-]*)=", override):
            out.pop(name, None)
        return "".join(f" {k}" if v is None else f" {k}={v}" for k, v in out.items()) + " " + override.strip()
    for k, v in (override or {}).items():
        if v is False:
            out.pop(k, None)
        else:
            out[k] = v
    return "".join(f" {k}" if v is None else f" {k}={v}" for k, v in out.items())


def norm_children(n):
    kids = []
    for c in n.children:
        if isinstance(c, str):
            if not c.strip():
                if "\n" in c:
                    continue
                kids.append(" ")
            else:
                kids.append(re.sub(r"\s+", " ", c))
        else:
            kids.append(c)
    return kids


def match_transform(n, transforms):
    if not transforms or isinstance(n, str):
        return None
    classes = (dict(n.attrs).get("class") or "").split()
    for tag, cls, comp, extra in transforms:
        if n.tag == tag and (cls is None or cls in classes):
            return comp, extra
    return None


def emit(n, slots, ind=0, transforms=None):
    pad = "  " * ind
    if isinstance(n, str):
        return esc_text(n) if n != " " else '{" "}'
    nid = dict(n.attrs).get("id")
    kind, payload = slots.get(nid, (None, None))
    if kind == "replace":
        return payload
    override = payload if kind == "attrs" else None
    if kind == "prepend":                                # extra attrs, then content before the original children
        override, payload = payload.split(" :: ", 1)
    a = attrs_jsx(n.tag, n.attrs, override)
    tag = n.tag
    tr = match_transform(n, transforms)
    if tr:
        tag, extra = tr
        a = a + (" " + extra if extra else "")
    if kind == "children":
        return f"<{tag}{a}>{payload}</{tag}>"
    kids = norm_children(n)
    if kind == "fallback":                               # React content when it has some, else the original
        orig = "".join(emit(k, slots, 0, transforms) if not isinstance(k, str) else (esc_text(k) if k != " " else '{" "}') for k in kids)
        expr = payload.strip()[1:-1] if payload.strip().startswith("{") else payload
        return f"<{tag}{a}>{{{expr} ?? <>{orig}</>}}</{tag}>"
    if kind == "prepend":
        orig = "".join(emit(k, slots, 0, transforms) if not isinstance(k, str) else (esc_text(k) if k != " " else '{" "}') for k in kids)
        return f"<{tag}{a}>{payload}{orig}</{tag}>"
    if n.tag in VOID or not kids:
        return f"<{tag}{a} />"
    if any(isinstance(k, str) for k in kids):            # mixed content: keep on one line, exact spacing
        inner = "".join(emit(k, slots, 0, transforms) if not isinstance(k, str) else (esc_text(k) if k != " " else '{" "}') for k in kids)
        return f"<{tag}{a}>{inner}</{tag}>"
    inner = "\n".join(pad + "  " + emit(k, slots, ind + 1, transforms) for k in kids)
    return f"<{tag}{a}>\n{inner}\n{pad}</{tag}>"


def convert(html, slots=None, ind=0, transforms=None):
    b = Builder()
    b.feed(html)
    b.close()
    kids = [k for k in norm_children(b.root) if not (isinstance(k, str) and k == " ")]
    return ("\n" + "  " * ind).join(emit(k, slots or {}, ind, transforms) for k in kids)


def extract(html, start_marker, end_marker):
    """The original markup between two literal markers (start inclusive, end exclusive)."""
    i = html.index(start_marker)
    j = html.index(end_marker, i + len(start_marker))
    return html[i:j]


def element(html, opening):
    """The complete element beginning with the literal `opening` tag, matched by nesting."""
    i = html.index(opening)
    tag = re.match(r"<([a-zA-Z0-9]+)", opening).group(1)
    depth, pos = 0, i
    pat = re.compile(rf"<(/?){tag}\b[^>]*?(/?)>")
    for m in pat.finditer(html, i):
        if m.group(2) == "/":
            continue
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return html[i:m.end()]
    raise ValueError("unbalanced " + opening)
