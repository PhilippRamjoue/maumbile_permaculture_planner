"""Request/response models for the auth API."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    display_name: str | None = Field(default=None, max_length=100)
    country_code: str | None = Field(default=None, pattern=r"^[A-Za-z]{2}$")


class LoginRequest(BaseModel):
    email: EmailStr
    # No length policy on login: never reveal the policy or reject legacy passwords.
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)


class UserRead(BaseModel):
    """The authenticated user as seen by clients and by other modules (``current_user``)."""

    model_config = ConfigDict(from_attributes=True, frozen=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str | None = None
    country_code: str | None = None
