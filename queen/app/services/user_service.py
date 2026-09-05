"""用户业务逻辑 (Queen 决策大脑 — 用户模块)。

API 层禁止编写业务 SQL，全部收敛在此层。
"""
import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.request import LoginRequest, RegisterRequest


class UserExistsError(Exception):
    """用户名已存在。"""


class AuthFailedError(Exception):
    """用户名或密码错误。"""


async def register(db: AsyncSession, req: RegisterRequest) -> User:
    result = await db.execute(select(User).where(User.username == req.username))
    if result.scalar_one_or_none() is not None:
        raise UserExistsError(f"username '{req.username}' already taken")
    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        role="wing",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)  # 回读 server_default 字段(created_at 等)，避免响应序列化时 lazy IO
    return user


async def login(db: AsyncSession, req: LoginRequest) -> str:
    """校验凭据，返回 JWT access token。"""
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(req.password, user.hashed_password):
        raise AuthFailedError("用户名或密码错误")
    if not user.is_active:
        raise AuthFailedError("账号已被禁用")
    return create_access_token(subject=str(user.id))


async def get_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def get_or_create_wx_user(db: AsyncSession, openid: str) -> User:
    """Antenna 端：按 openid 查找或创建用户。"""
    result = await db.execute(select(User).where(User.wx_openid == openid))
    user = result.scalar_one_or_none()
    if user is not None:
        return user
    user = User(
        username=f"wx_{openid[:16]}",
        hashed_password=hash_password(openid),  # 微信用户无本地密码
        role="antenna",
        wx_openid=openid,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


# ---------- 用户管理（admin/operator 域） ----------

async def list_users(
    db: AsyncSession, keyword: str = "", limit: int = 20, offset: int = 0,
    is_active: bool | None = None,
) -> tuple[list[User], int]:
    """用户列表 + 总数。keyword 匹配 username/email；is_active 筛选状态。"""
    from sqlalchemy import func, or_, select as _sel

    stmt = _sel(User)
    if keyword:
        like = f"%{keyword}%"
        stmt = stmt.where(or_(User.username.like(like), User.email.like(like)))
    if is_active is not None:
        stmt = stmt.where(User.is_active == is_active)
    total = await db.scalar(
        _sel(func.count()).select_from(stmt.subquery())
    )
    rows = await db.execute(
        stmt.order_by(User.id.desc()).limit(min(limit, 100)).offset(offset)
    )
    return list(rows.scalars().all()), int(total or 0)


async def update_user_role(db: AsyncSession, target: User, new_role: str, actor: User) -> User:
    """改角色。守卫：admin 不可被非 admin 改动；不可改动 admin 的角色（防自锁）。"""
    if new_role not in ("admin", "operator", "wing", "antenna"):
        raise ValueError(f"未知角色: {new_role}")
    if target.role == "admin":
        raise PermissionError("admin 账号角色锁死，不可变更")
    target.role = new_role
    db.add(target)
    await db.flush()
    from app.models.sys_log import SysLog
    db.add(SysLog(user_id=actor.id, level="WARN", source="rbac",
                  message=f"用户 {target.username} 角色变更为 {new_role}"))
    await db.flush()
    return target


async def set_user_status(db: AsyncSession, target: User, active: bool, actor: User) -> User:
    """启用/禁用。admin 不可被禁用（防全体自锁）。"""
    if target.role == "admin" and not active:
        raise PermissionError("admin 账号不可禁用")
    target.is_active = active
    db.add(target)
    await db.flush()
    from app.models.sys_log import SysLog
    db.add(SysLog(user_id=actor.id, level="WARN", source="rbac",
                  message=f"用户 {target.username} 状态设为 {'启用' if active else '禁用'}"))
    await db.flush()
    return target


async def record_login(db: AsyncSession, user: User, ip: str | None) -> None:
    """登录留痕：最后登录时间/IP。"""
    user.last_login_at = datetime.datetime.now(datetime.timezone.utc)
    user.last_login_ip = ip
    db.add(user)
    await db.flush()
