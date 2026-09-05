"""crop source file: original_filename/file_mime/file_blob on pn_crop_document

Revision ID: e8f2b5d7c1a4
Revises: d5e7a1c3f9b2
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import MEDIUMBLOB

revision = "e8f2b5d7c1a4"
down_revision = "d5e7a1c3f9b2"


def upgrade() -> None:
    op.add_column("pn_crop_document", sa.Column("original_filename", sa.String(255), nullable=True))
    op.add_column("pn_crop_document", sa.Column("file_mime", sa.String(128), nullable=True))
    op.add_column("pn_crop_document", sa.Column("file_blob", MEDIUMBLOB(), nullable=True))


def downgrade() -> None:
    op.drop_column("pn_crop_document", "file_blob")
    op.drop_column("pn_crop_document", "file_mime")
    op.drop_column("pn_crop_document", "original_filename")
