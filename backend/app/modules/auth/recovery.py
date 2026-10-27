"""SMTP delivery for password recovery. Never log message bodies or recovery tokens."""

import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import quote

import structlog

from app.core.config import Settings


def recovery_enabled(settings: Settings) -> bool:
    return bool(
        settings.smtp_host and settings.smtp_from and settings.public_origin.startswith("https://")
    )


def send_password_reset(email: str, token: str, settings: Settings) -> None:
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = email
    message["Subject"] = "Reset your Maumbile password"
    link = f"{settings.public_origin.rstrip('/')}/reset-password?token={quote(token)}"
    message.set_content(
        f"Use this link within 30 minutes to reset your password:\n\n{link}\n\n"
        "If you did not request this, you can ignore this email."
    )
    try:
        client = (
            smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=15,
                context=ssl.create_default_context(),
            )
            if settings.smtp_port == 465
            else smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
        )
        with client as smtp:
            if settings.smtp_port != 465:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
            smtp.send_message(message)
    except Exception:
        # SMTP exceptions can contain addresses or message text: retain only an operational signal.
        structlog.get_logger(__name__).error("password_reset_delivery_failed")
