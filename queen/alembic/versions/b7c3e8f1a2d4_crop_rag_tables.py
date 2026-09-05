"""crop rag: pn_crop_document/pn_crop_chunk + seed crop perms

Revision ID: b7c3e8f1a2d4
Revises: a8f2c1d4e9b0

权威/投影分离：MySQL 存原文+chunk+embedding（唯一权威，只 INSERT）；
Redis 8 Vector Sets 是可重建投影。
存量角色的 crop 权限种子：admin 全域 / operator 全域 / wing+antenna 只读。
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import MEDIUMBLOB

revision = "b7c3e8f1a2d4"
down_revision = "a8f2c1d4e9b0"

CROP_PERM_SEEDS = [
    ("admin", "crop"),
    ("operator", "crop"),
    ("wing", "crop:read"),
    ("antenna", "crop:read"),
]


def upgrade() -> None:
    op.create_table(
        "pn_crop_document",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(255), nullable=False, index=True),
        sa.Column("source_type", sa.String(16), nullable=False, server_default="text"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(16), nullable=False, server_default="ready"),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("created_by", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.current_timestamp()
        ),
        mysql_charset="utf8mb4",
    )
    op.create_table(
        "pn_crop_chunk",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("document_id", sa.BigInteger(), nullable=False, index=True),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("embedding", MEDIUMBLOB(), nullable=False),
        sa.Column("embedding_model", sa.String(64), nullable=False, server_default=""),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.current_timestamp()
        ),
        mysql_charset="utf8mb4",
    )
    op.create_index(
        "ix_pn_crop_chunk_document", "pn_crop_chunk", ["document_id", "seq"]
    )
    # 存量角色补 crop 权限（幂等：ON DUPLICATE 跳过）
    perms = sa.table(
        "pn_role_perm", sa.column("role_key", sa.String), sa.column("perm", sa.String)
    )
    for role_key, perm in CROP_PERM_SEEDS:
        op.execute(
            perms.insert().prefix_with("IGNORE").values(role_key=role_key, perm=perm)
        )


def downgrade() -> None:
    op.execute("DELETE FROM pn_role_perm WHERE perm LIKE 'crop%'")
    op.drop_index("ix_pn_crop_chunk_document", table_name="pn_crop_chunk")
    op.drop_table("pn_crop_chunk")
    op.drop_table("pn_crop_document")
