"""Shared HTML email layout for TimeIQ.

Design notes
- One 600px card on a soft aurora page background, hero banner image on top
  (generated PNGs in frontend/public/email), white content card with rounded
  corners, a single primary action, and a quiet footer.
- Everything is inline-styled tables so Gmail, Outlook, and Apple Mail agree.
  Gradients live in the hero image rather than CSS, so they render everywhere.
- Buttons use the VML fallback so they are clickable in Outlook for Windows.
- Every builder escapes text it receives; pass already-safe HTML only through
  the *_html parameters.
"""
from __future__ import annotations

from html import escape as esc

from app.config import settings

INK = "#111421"
MUTED = "#636a7a"
INDIGO = "#6254f0"
PAGE_BG = "#f5f6fb"
CARD_BORDER = "#e6e8f2"
PANEL_BG = "#f7f8fc"
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

HEROES = {"confirmed", "new-booking", "cancelled", "invoice", "welcome", "reminder"}


def _asset(name: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/email/{name}"


def h1(text: str) -> str:
    return (
        f'<h1 style="margin:0 0 12px;font-family:{FONT};font-size:26px;line-height:32px;'
        f'font-weight:700;letter-spacing:-0.02em;color:{INK};">{esc(text)}</h1>'
    )


def p(text: str, muted: bool = False) -> str:
    color = MUTED if muted else INK
    return (
        f'<p style="margin:0 0 16px;font-family:{FONT};font-size:16px;line-height:25px;'
        f'color:{color};">{esc(text)}</p>'
    )


def p_html(html: str, muted: bool = False) -> str:
    color = MUTED if muted else INK
    return (
        f'<p style="margin:0 0 16px;font-family:{FONT};font-size:16px;line-height:25px;'
        f'color:{color};">{html}</p>'
    )


def big_number(text: str, caption: str) -> str:
    return (
        f'<div style="margin:4px 0 20px;">'
        f'<div style="font-family:{FONT};font-size:40px;line-height:44px;font-weight:700;'
        f'letter-spacing:-0.03em;color:{INK};">{esc(text)}</div>'
        f'<div style="font-family:{FONT};font-size:13px;line-height:18px;color:{MUTED};'
        f'text-transform:uppercase;letter-spacing:0.12em;margin-top:4px;">{esc(caption)}</div>'
        f"</div>"
    )


def details(rows: list[tuple[str, str]], rows_html: bool = False) -> str:
    """Key/value panel. Values are escaped unless rows_html=True."""
    trs = []
    for label, value in rows:
        if not value:
            continue
        v = value if rows_html else esc(value)
        trs.append(
            f'<tr>'
            f'<td style="padding:10px 18px;font-family:{FONT};font-size:12px;line-height:18px;'
            f'color:{MUTED};text-transform:uppercase;letter-spacing:0.1em;white-space:nowrap;'
            f'vertical-align:top;width:120px;">{esc(label)}</td>'
            f'<td style="padding:10px 18px 10px 0;font-family:{FONT};font-size:15px;line-height:22px;'
            f'color:{INK};vertical-align:top;">{v}</td>'
            f"</tr>"
        )
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
        f'style="margin:0 0 20px;background:{PANEL_BG};border:1px solid {CARD_BORDER};'
        f'border-radius:16px;border-collapse:separate;">'
        f'<tr><td style="padding:6px 0;">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
        + "".join(trs)
        + "</table></td></tr></table>"
    )


def button(label: str, url: str, secondary: bool = False) -> str:
    bg = "#ffffff" if secondary else INDIGO
    fg = INK if secondary else "#ffffff"
    border = f"1px solid {CARD_BORDER}" if secondary else f"1px solid {INDIGO}"
    safe_url = esc(url, quote=True)
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        f'style="display:inline-table;margin:0 8px 8px 0;">'
        f"<tr><td>"
        f"<!--[if mso]>"
        f'<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" '
        f'href="{safe_url}" style="height:46px;v-text-anchor:middle;width:220px;" arcsize="50%" '
        f'stroke="f" fillcolor="{bg}"><w:anchorlock/><center style="color:{fg};font-family:Arial,sans-serif;'
        f'font-size:15px;font-weight:bold;">{esc(label)}</center></v:roundrect>'
        f"<![endif]-->"
        f"<!--[if !mso]><!-->"
        f'<a href="{safe_url}" style="display:inline-block;background:{bg};color:{fg};font-family:{FONT};'
        f"font-size:15px;font-weight:600;line-height:46px;text-decoration:none;padding:0 26px;"
        f'border-radius:23px;border:{border};mso-hide:all;">{esc(label)}</a>'
        f"<!--<![endif]-->"
        f"</td></tr></table>"
    )


def buttons(*btns: str) -> str:
    return f'<div style="margin:4px 0 20px;">{"".join(btns)}</div>'


def checklist(items: list[tuple[str, str, str]]) -> str:
    """Numbered steps: (title, description, url)."""
    rows = []
    for i, (title, desc, url) in enumerate(items, 1):
        rows.append(
            f'<tr>'
            f'<td style="padding:14px 0 14px 18px;vertical-align:top;width:40px;">'
            f'<div style="width:28px;height:28px;border-radius:14px;background:{INDIGO};color:#ffffff;'
            f'font-family:{FONT};font-size:13px;font-weight:700;line-height:28px;text-align:center;">{i}</div>'
            f"</td>"
            f'<td style="padding:12px 18px 12px 12px;vertical-align:top;">'
            f'<a href="{esc(url, quote=True)}" style="font-family:{FONT};font-size:16px;font-weight:600;'
            f'line-height:22px;color:{INK};text-decoration:none;">{esc(title)}</a>'
            f'<div style="font-family:{FONT};font-size:14px;line-height:21px;color:{MUTED};margin-top:2px;">{esc(desc)}</div>'
            f"</td></tr>"
        )
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
        f'style="margin:0 0 20px;background:{PANEL_BG};border:1px solid {CARD_BORDER};border-radius:16px;'
        f'border-collapse:separate;">' + "".join(rows) + "</table>"
    )


def signoff(name: str, role: str) -> str:
    return (
        f'<p style="margin:8px 0 0;font-family:{FONT};font-size:15px;line-height:23px;color:{INK};">'
        f"{esc(name)}<br><span style=\"color:{MUTED};font-size:13px;\">{esc(role)}</span></p>"
    )


def layout(hero: str, preheader: str, body_html: str, footer_note: str | None = None) -> str:
    """Wrap body_html in the shared shell. `hero` is one of HEROES."""
    assert hero in HEROES, hero
    hero_url = _asset(f"hero-{hero}.png")
    site = settings.FRONTEND_URL.rstrip("/")
    note = f'<div style="margin-top:8px;">{esc(footer_note)}</div>' if footer_note else ""
    return f"""<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>TimeIQ</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  body {{ margin:0; padding:0; background:{PAGE_BG}; -webkit-font-smoothing:antialiased; }}
  img {{ border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }}
  a {{ color:{INDIGO}; }}
  @media (max-width: 640px) {{
    .card {{ width:100% !important; }}
    .pad {{ padding:24px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:{PAGE_BG};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:{PAGE_BG};opacity:0;">{esc(preheader)}{"&nbsp;&zwnj;" * 40}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:{PAGE_BG};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" class="card" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">
    <tr><td style="border-radius:28px 28px 0 0;overflow:hidden;">
      <img src="{hero_url}" width="600" alt="TimeIQ" style="display:block;width:100%;height:auto;border-radius:28px 28px 0 0;">
    </td></tr>
    <tr><td class="pad" style="background:#ffffff;border:1px solid {CARD_BORDER};border-top:0;border-radius:0 0 28px 28px;padding:36px 40px 28px;">
      {body_html}
    </td></tr>
    <tr><td style="padding:22px 12px 0;text-align:center;font-family:{FONT};font-size:12px;line-height:18px;color:{MUTED};">
      <a href="{site}" style="color:{MUTED};text-decoration:none;font-weight:600;">TimeIQ</a>
      &nbsp;·&nbsp; Book meetings. Log hours. Send invoices.
      &nbsp;·&nbsp; <a href="{site}/privacy" style="color:{MUTED};">Privacy</a>
      {note}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"""
