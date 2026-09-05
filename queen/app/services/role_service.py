"""动态角色管理 (pn_role / pn_role_perm)。

角色定义运行时可配置：矩阵页增删改角色与权限。
守卫：admin 角色锁定；有用户引用的角色不可删除（防孤儿权限）。
"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import ALL_PERMS, _parse_perm
from app.models.role import Role, RolePerm
from app.models.sys_log import SysLog
from app.models.user import User


class RoleError(Exception):
    """角色操作业务错误（409/422 语义）。"""


async def list_roles(db: AsyncSession) -> list[Role]:
    result = await db.execute(select(Role).order_by(Role.key))
    return list(result.scalars().all())


async def role_user_counts(db: AsyncSession) -> dict[str, int]:
    """每个角色的用户数（删除守卫与矩阵页展示用）。"""
    result = await db.execute(
        select(User.role, func.count(User.id)).group_by(User.role)
    )
    return {r[0]: r[1] for r in result.all()}


def _validate_perms(perms: list[str]) -> None:
    for p in perms:
        domain, action = _parse_perm(p)
        if domain not in ALL_PERMS or (action and action not in ("read", "write")):
            raise RoleError(f"非法权限点「{p}」：域须为 {ALL_PERMS} 之一，动作 read/write")


async def create_role(db: AsyncSession, key: str, name: str, perms: list[str], actor_id: int, description: str | None = None) -> Role:
    key = key.strip().lower()
    if not key.replace("_", "").isalnum() or len(key) > 32:
        raise RoleError("角色 key 仅限字母/数字/下划线，≤32 字符")
    if key == "admin":
        raise RoleError("admin 为内置锁定角色，不可创建同名角色")
    if await db.get(Role, key) is not None:
        raise RoleError(f"角色 {key} 已存在")
    _validate_perms(perms)
    role = Role(key=key, name=name.strip() or key, description=description)
    db.add(role)
    await db.flush()
    for p in set(perms):
        db.add(RolePerm(role_key=key, perm=p))
    db.add(SysLog(user_id=actor_id, level="WARN", source="rbac",
                  message=f"创建角色 {key}（{name}）权限 {perms}"))
    await db.flush()
    await db.refresh(role)
    return role


async def update_role(db: AsyncSession, key: str, name: str | None, perms: list[str] | None, actor_id: int) -> Role:
    role = await db.get(Role, key)
    if role is None:
        raise RoleError(f"角色 {key} 不存在")
    if role.is_locked and perms is not None:
        raise RoleError("admin 角色锁定，权限不可修改")
    if name is not None:
        role.name = name.strip() or role.name
        db.add(role)
    if perms is not None:
        _validate_perms(perms)
        # 全量替换该角色权限
        result = await db.execute(select(RolePerm).where(RolePerm.role_key == key))
        for old in result.scalars().all():
            await db.delete(old)
        await db.flush()  # 必须先落删除：unit-of-work 中 INSERT 先于 DELETE，否则撞唯一键
        for p in set(perms):
            db.add(RolePerm(role_key=key, perm=p))
    db.add(SysLog(user_id=actor_id, level="WARN", source="rbac",
                  message=f"更新角色 {key}（name={name}, perms={perms}）"))
    await db.flush()
    await db.refresh(role)
    return role


async def delete_role(db: AsyncSession, key: str, actor_id: int) -> None:
    role = await db.get(Role, key)
    if role is None:
        raise RoleError(f"角色 {key} 不存在")
    if role.is_locked:
        raise RoleError("admin 角色锁定，不可删除")
    counts = await role_user_counts(db)
    if counts.get(key, 0) > 0:
        raise RoleError(f"角色 {key} 仍有 {counts[key]} 个用户引用，先迁移这些用户再删除")
    await db.delete(role)
    db.add(SysLog(user_id=actor_id, level="WARN", source="rbac",
                  message=f"删除角色 {key}"))
    await db.flush()
