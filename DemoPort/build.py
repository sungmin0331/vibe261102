"""profile.json과 templates/index.html로 정적 index.html을 만든다.

사용법:
    python build.py

표준 라이브러리만 사용하므로 별도 설치가 필요 없다.
"""

from __future__ import annotations

import json
import re
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "profile.json"
TEMPLATE_FILE = ROOT / "templates" / "index.html"
OUTPUT_FILE = ROOT / "index.html"

INDENT = " " * 10


def tag_list(items: list[str]) -> str:
    tags = "".join(f'<li class="tag">{escape(item)}</li>' for item in items)
    return f'<ul class="tag-list">{tags}</ul>'


def external_link(label: str, url: str, cls: str = "") -> str:
    cls_attr = f' class="{cls}"' if cls else ""
    return f'<a{cls_attr} href="{escape(url)}" target="_blank" rel="noopener noreferrer">{escape(label)}</a>'


def render_about(paragraphs: list[str]) -> str:
    return "\n".join(f"{INDENT}<p>{escape(p)}</p>" for p in paragraphs)


def render_skills(groups: list[dict]) -> str:
    blocks = []
    for group in groups:
        cls = "skill-group primary" if group.get("primary") else "skill-group"
        blocks.append(
            f'{INDENT}<div class="{cls}">\n'
            f'{INDENT}  <h3>{escape(group["category"])}</h3>\n'
            f"{INDENT}  {tag_list(group['items'])}\n"
            f"{INDENT}</div>"
        )
    return "\n".join(blocks)


def render_projects(projects: list[dict]) -> str:
    cards = []
    for project in projects:
        links = [
            external_link(label, project[key])
            for key, label in (("github", "GitHub"), ("demo", "Demo"))
            if project.get(key)
        ]
        links_html = f'\n{INDENT}  <div class="project-links">{"".join(links)}</div>' if links else ""
        cards.append(
            f'{INDENT}<article class="project-card">\n'
            f'{INDENT}  <h3>{escape(project["title"])}</h3>\n'
            f'{INDENT}  <p>{escape(project["description"])}</p>\n'
            f"{INDENT}  {tag_list(project.get('tags', []))}"
            f"{links_html}\n"
            f"{INDENT}</article>"
        )
    return "\n".join(cards)


def render_experience(items: list[dict]) -> str:
    entries = []
    for item in items:
        entries.append(
            f'{INDENT}<li class="timeline-item">\n'
            f'{INDENT}  <span class="timeline-period">{escape(item["period"])}</span>\n'
            f'{INDENT}  <h3>{escape(item["title"])} <span class="timeline-org">· {escape(item["org"])}</span></h3>\n'
            f'{INDENT}  <p>{escape(item["description"])}</p>\n'
            f"{INDENT}</li>"
        )
    return "\n".join(entries)


def render_links(links: list[dict]) -> str:
    # URL이 비어 있는 링크는 아직 정해지지 않은 것으로 보고 건너뛴다
    return "\n".join(
        f'{INDENT}<li>{external_link(link["label"], link["url"], "btn btn-ghost")}</li>'
        for link in links
        if link.get("url")
    )


def build() -> Path:
    profile = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    template = TEMPLATE_FILE.read_text(encoding="utf-8")
    today = date.today()

    values = {
        "name": escape(profile["name"]),
        "role": escape(profile["role"]),
        "tagline": escape(profile["tagline"]),
        "email": escape(profile["email"]),
        "location": escape(profile.get("location", "")),
        "interests": escape(", ".join(profile.get("interests", []))),
        "about": render_about(profile.get("about", [])),
        "skills": render_skills(profile.get("skills", [])),
        "projects": render_projects(profile.get("projects", [])),
        "experience": render_experience(profile.get("experience", [])),
        "links": render_links(profile.get("links", [])),
        "year": str(today.year),
        "updated": today.isoformat(),
    }

    def substitute(match: re.Match) -> str:
        key = match.group(1)
        if key not in values:
            raise KeyError(f"템플릿에 알 수 없는 값이 있습니다: {{{{{key}}}}}")
        return values[key]

    html = re.sub(r"\{\{(\w+)\}\}", substitute, template)
    OUTPUT_FILE.write_text(html, encoding="utf-8")
    return OUTPUT_FILE


if __name__ == "__main__":
    print(f"생성 완료: {build().relative_to(ROOT)}")
