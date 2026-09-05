"""cercus wecom: pn_wecom_contact/pn_wecom_followup + seed wecom perms

Cercus 尾须——企微私域客户域（通用骨架）：
企微为联系人权威源，本表为镜像+运营扩展；跟进记录为运营自己的 append-only 权威。
"""
from alembic import op
import sqlalchemy as sa

revision = "c9d4f2a6b8e1"
down_revision = "b7c3e8f1a2d4"

WECOM_PERM_SEEDS = [
    ("admin", "wecom"),
    ("operator", "wecom"),
]


def _exists(table: str) -> bool:
    from sqlalchemy import inspect

    insp = inspect(op.get_bind())
    return insp.has_table(table)


def upgrade() -> None:
    # 幂等保护：首跑曾在非事务 DDL 中半途失败（contact 已建/followup 未建）
    if not _exists("pn_wecom_contact"):
        op.create_table(
            "pn_wecom_contact",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("external_userid", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("staff_userid", sa.String(64), nullable=False, index=True),
        sa.Column("name", sa.String(128), nullable=False, server_default=""),
        sa.Column("unionid", sa.String(64), nullable=False, server_default=""),
        sa.Column("avatar", sa.String(512), nullable=False, server_default=""),
        sa.Column("remark_mobile", sa.String(32), nullable=False, server_default=""),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("kv", sa.JSON(), nullable=False),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp()),
        mysql_charset="utf8mb4",
    )
    if not _exists("pn_wecom_followup"):
        op.create_table(
            "pn_wecom_followup",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("contact_id", sa.BigInteger(), nullable=False, index=True),
        sa.Column("staff_userid", sa.String(64), nullable=False, server_default=""),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("next_at", sa.DateTime(), nullable=True),
        sa.Column("done", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp()),
        mysql_charset="utf8mb4",
    )
    _has_idx = _exists("pn_wecom_followup") and any(
        ix.get("name") == "ix_pn_wecom_followup_contact"
        for ix in __import__("sqlalchemy").inspect(op.get_bind()).get_indexes("pn_wecom_followup")
    )
    if not _has_idx:
        op.create_index(
            "ix_pn_wecom_followup_contact", "pn_wecom_followup", ["contact_id", "created_at"]
        )
    perms = sa.table(
        "pn_role_perm", sa.column("role_key", sa.String), sa.column("perm", sa.String)
    )
    for role_key, perm in WECOM_PERM_SEEDS:
        op.execute(
            perms.insert().prefix_with("IGNORE").values(role_key=role_key, perm=perm)
        )


def downgrade() -> None:
    op.execute("DELETE FROM pn_role_perm WHERE perm LIKE 'wecom%'")
    op.drop_index("ix_pn_wecom_followup_contact", table_name="pn_wecom_followup")
    op.drop_table("pn_wecom_followup")
    op.drop_table("pn_wecom_contact")
