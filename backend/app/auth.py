from __future__ import annotations

import hashlib
import hmac
from hmac import compare_digest

from fastapi import HTTPException, Request, Response, status

from .config import get_settings
from .schemas import AuthSessionResponse


def _expected_username() -> str:
    return get_settings().auth_username


def _cookie_name() -> str:
    return get_settings().auth_session_cookie_name


def _signed_token(username: str) -> str:
    secret = get_settings().auth_session_secret.encode("utf-8")
    signature = hmac.new(secret, username.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{username}:{signature}"


def _extract_authenticated_username(request: Request) -> str | None:
    raw_cookie = request.cookies.get(_cookie_name())
    if not raw_cookie or ":" not in raw_cookie:
        return None

    username, signature = raw_cookie.split(":", 1)
    if not isinstance(username, str) or not isinstance(signature, str):
        return None
    if not compare_digest(username, _expected_username()):
        return None

    expected_token = _signed_token(username)
    if not compare_digest(raw_cookie, expected_token):
        return None
    return username


def is_authenticated_request(request: Request) -> bool:
    return _extract_authenticated_username(request) is not None


def build_auth_session_response(request: Request) -> AuthSessionResponse:
    username = _extract_authenticated_username(request)
    if username is not None:
        return AuthSessionResponse(authenticated=True, username=username)
    return AuthSessionResponse(authenticated=False, username=None)


def set_authenticated_cookie(response: Response, username: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.auth_session_cookie_name,
        value=_signed_token(username),
        max_age=settings.auth_session_max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        path="/",
    )


def clear_authenticated_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.auth_session_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
    )


def authenticate_with_password(*, username: str, password: str) -> bool:
    settings = get_settings()
    if not compare_digest(username, settings.auth_username):
        return False
    if not compare_digest(password, settings.auth_password):
        return False
    return True


def require_authenticated_user(request: Request) -> str:
    username = _extract_authenticated_username(request)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录。",
        )
    return username
