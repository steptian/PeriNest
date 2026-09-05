"""RAG 知识库表（Crop 嗦囊 — 先吞后消化）。

权威/投影分离（借鉴 DeepSeek Harness JSONL-only 决策）：
- MySQL 是唯一权威：原文、chunk、embedding BLOB 只 INSERT 不改写
- Redis 8 Vector Sets 是可丢弃投影：清空/升级后从本表重建，坏了不修
"""
import datetime

from sqlalchemy import BigInteger, DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.mysql import MEDIUMBLOB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CropDocument(Base):
    """知识文档（吞入嗉囊的完整食物）。"""

    __tablename__ = "pn_crop_document"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    source_type: Mapped[str] = mapped_column(String(16), default="text")  # text/markdown
    content: Mapped[str] = mapped_column(Text)  # 原文完整保留（权威，永不改写）
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="ready")  # embedding/ready/failed
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # 上传者 pn_user.id
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class CropChunk(Base):
    """文档分块 + 向量（消化后的食物微粒）。

    embedding 存 float32 打包字节（EMBEDDING_DIM 维 × 4 字节），
    Redis Vector Set 的投影即由此重建。
    """

    __tablename__ = "pn_crop_chunk"
    __table_args__ = (
        Index("ix_pn_crop_chunk_document", "document_id", "seq"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(BigInteger, index=True)
    seq: Mapped[int] = mapped_column(Integer)  # 文档内序号，从 0 起
    content: Mapped[str] = mapped_column(Text)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[bytes] = mapped_column(MEDIUMBLOB)  # float32 packed bytes
    embedding_model: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
