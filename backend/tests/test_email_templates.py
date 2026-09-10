from types import SimpleNamespace as NS

from app.services import email as E
from app.services import email_templates as t


def test_layout_escapes_and_includes_hero():
    html = t.layout("welcome", "pre<b>header", t.h1("Hi <script>"), footer_note="a & b")
    assert "hero-welcome.png" in html
    assert "pre&lt;b&gt;header" in html
    assert "Hi &lt;script&gt;" in html
    assert "a &amp; b" in html


def test_button_has_outlook_fallback_and_escaped_url():
    html = t.button("Go", 'https://x.test/?a=1&b="2"')
    assert "v:roundrect" in html
    assert 'href="https://x.test/?a=1&amp;b=&quot;2&quot;"' in html


def test_welcome_render_uses_first_name_and_checklist():
    html = E.render_welcome(NS(name="Sam Rivera", email="s@x.test", username="sam"))
    assert "Welcome, Sam." in html
    assert "/book/sam" in html
    assert html.count('border-radius:14px;background:') == 3  # three numbered steps
