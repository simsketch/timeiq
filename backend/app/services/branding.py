"""Bounded raster logos for public booking pages."""
import base64
import binascii
import io

from PIL import Image, UnidentifiedImageError


def validate_booking_logo(value: str | None) -> str | None:
    if value is None:
        return None
    prefix = "data:image/png;base64,"
    if not value.startswith(prefix):
        raise ValueError("Upload a PNG, JPEG or WebP logo using the booking page settings.")
    try:
        raw = base64.b64decode(value[len(prefix):], validate=True)
        if len(raw) > 128 * 1024:
            raise ValueError("The resized logo must be under 128 KB.")
        with Image.open(io.BytesIO(raw)) as image:
            if image.format != "PNG" or not (1 <= image.width <= 1024 and 1 <= image.height <= 1024):
                raise ValueError("The logo must be a PNG no larger than 1024 × 1024 pixels.")
            if getattr(image, "is_animated", False):
                raise ValueError("Choose a still image for your logo.")
            image.verify()
    except (binascii.Error, OSError, SyntaxError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValueError("The logo is not a valid PNG image.") from exc
    return value
