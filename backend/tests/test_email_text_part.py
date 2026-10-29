from app.services import email as mail


def test_html_to_text_keeps_structure_and_links():
    html = (
        "<html><head><style>p{color:red}</style></head><body>"
        "<p>Hi Sam,</p><table><tr><td>When</td><td>Thu &amp; Fri</td></tr></table>"
        '<p><a href="https://timeiq.app/b/1">Reschedule</a></p></body></html>'
    )
    text = mail.html_to_text(html)
    assert "color:red" not in text
    assert "Hi Sam," in text
    assert "When Thu & Fri" in text
    assert "Reschedule (https://timeiq.app/b/1)" in text


def test_with_text_adds_text_part_once():
    payload = mail.with_text({"html": "<p>Hello</p>"})
    assert payload["text"] == "Hello"
    assert mail.with_text({"html": "<p>x</p>", "text": "keep"})["text"] == "keep"
