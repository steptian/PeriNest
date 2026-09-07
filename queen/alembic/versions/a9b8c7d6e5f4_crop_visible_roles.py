"""crop visible_roles: document-level visibility (role keys, csv; empty=all)

Revision ID: a9b8c7d6e5f4
Revises: b3c4d5e6f7a8
"""
from alembic import op
import sqlalchemy as sa

revision = "a9b8c7d6e5f4"
down_revision = "b3c4d5e6f7a8"


def upgrade() -> None:
    op.add_column("pn_crop_document", sa.Column("visible_roles", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("pn_crop_document", "visible_roles")
