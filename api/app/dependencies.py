from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import User, WorkspaceMember
from .security import decode_access_token
from .settings import get_settings

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    settings = get_settings()
    if not settings.app_secret_key:
        raise HTTPException(status_code=503, detail={"code": "auth_not_configured"})
    token = credentials.credentials if credentials else request.cookies.get("competitoriq_session")
    if not token:
        raise HTTPException(status_code=401, detail={"code": "authentication_required"})
    user_id = decode_access_token(token, settings.app_secret_key)
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status_code=401, detail={"code": "invalid_token"})
    return user


def get_workspace_id(
    workspace_id: str = Header(alias="X-Workspace-ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    membership = db.scalar(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ))
    if membership is None:
        raise HTTPException(status_code=404, detail={"code": "workspace_not_found"})
    return workspace_id