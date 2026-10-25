"""Base for PATCH bodies: fields may be omitted, but required ones can't be null.

Update schemas declare every field Optional so a client can send only what it
changes. Without this, an explicit ``null`` for a column the database requires
slips through validation and fails at flush time as a 500. Subclasses list the
columns that must not be cleared in ``NON_NULLABLE``; an explicit null for one
of them becomes a 422 naming the field.
"""
from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, model_validator
from pydantic_core import InitErrorDetails, PydanticCustomError, ValidationError


class PartialUpdate(BaseModel):
    NON_NULLABLE: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="wrap")
    @classmethod
    def _reject_explicit_nulls(cls, data: Any, handler):
        if isinstance(data, dict):
            bad = sorted(k for k in cls.NON_NULLABLE if k in data and data[k] is None)
            if bad:
                raise ValidationError.from_exception_data(
                    cls.__name__,
                    [
                        InitErrorDetails(
                            type=PydanticCustomError("null_not_allowed", "This field can't be empty"),
                            loc=(field,),
                            input=None,
                        )
                        for field in bad
                    ],
                )
        return handler(data)
