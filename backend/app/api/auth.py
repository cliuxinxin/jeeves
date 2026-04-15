from fastapi import APIRouter, HTTPException, Request, Response, status

from ..auth import (
    authenticate_with_password,
    build_auth_session_response,
    clear_authenticated_cookie,
    set_authenticated_cookie,
)
from ..schemas import AuthLoginRequest, AuthSessionResponse

router = APIRouter(tags=["auth"])


@router.get("/api/auth/session", response_model=AuthSessionResponse)
async def get_auth_session(request: Request) -> AuthSessionResponse:
    return build_auth_session_response(request)


@router.post("/api/auth/login", response_model=AuthSessionResponse)
async def login(
    request: Request,
    response: Response,
    payload: AuthLoginRequest,
) -> AuthSessionResponse:
    authenticated = authenticate_with_password(
        username=payload.username,
        password=payload.password,
    )
    if not authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误。",
        )
    set_authenticated_cookie(response, payload.username)
    return AuthSessionResponse(authenticated=True, username=payload.username)


@router.post("/api/auth/logout", response_model=AuthSessionResponse)
async def logout(response: Response) -> AuthSessionResponse:
    clear_authenticated_cookie(response)
    return AuthSessionResponse(authenticated=False, username=None)
