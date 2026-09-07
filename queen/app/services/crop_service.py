"""Crop 嗦囊业务（RAG 知识库 ingest + 检索）。

权限逻辑只写在这里（共生体原则：REST 与 MCP 复用同一份）。
分块策略 v1：按段落聚合，~600 字一块，中文优先。
"""
import structlog
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crop import CropChunk, CropDocument
from app.models.user import User
from app.schemas.request import CropDocumentCreate
from app.services import crop_vector_store
from app.services.embedding_service import embed_texts, pack_vector

logger = structlog.get_logger(__name__)

CHUNK_TARGET_CHARS = 600  # 聚合目标块大小

# 支持的吞入文件格式（模板务实版：文字层提取，扫描件/OCR 不做——
# ack-agent 有生产级 OCR 方案，需要时再抄）
UPLOAD_MAX_BYTES = 10 * 1024 * 1024
UPLOAD_TYPES = {
    ".txt": "text",
    ".md": "markdown",
    ".markdown": "markdown",
    ".pdf": "pdf",
    ".docx": "docx",
}


class UploadUnsupported(Exception):
    """不支持的文件格式/损坏文件。"""


def extract_text(filename: str, raw: bytes) -> tuple[str, str]:
    """按扩展名提取文本。返回 (文本, source_type)。失败抛 UploadUnsupported。"""
    import io

    name = filename.lower()
    ext = next((e for e in UPLOAD_TYPES if name.endswith(e)), None)
    if ext is None:
        raise UploadUnsupported(f"不支持的格式「{filename}」——支持 {'/'.join(UPLOAD_TYPES)}")
    if len(raw) > UPLOAD_MAX_BYTES:
        raise UploadUnsupported("文件超过 10MB 限制")
    source_type = UPLOAD_TYPES[ext]

    if ext in (".txt", ".md", ".markdown"):
        try:
            return raw.decode("utf-8"), source_type
        except UnicodeDecodeError:
            try:
                return raw.decode("gbk"), source_type
            except UnicodeDecodeError as e:
                raise UploadUnsupported("文本编码无法识别（支持 UTF-8/GBK）") from e

    if ext == ".pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(raw))
            pages = [(page.extract_text() or "").strip() for page in reader.pages]
            text = "\n\n".join(p for p in pages if p)
        except Exception as e:
            raise UploadUnsupported(f"PDF 解析失败（加密/损坏）：{e}") from e
        if len(text) < 10:
            raise UploadUnsupported("PDF 无文字层（扫描件）——请粘贴文本或先 OCR")
        return text, source_type

    if ext == ".docx":
        try:
            import docx

            doc = docx.Document(io.BytesIO(raw))
            paras = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
            text = "\n\n".join(paras)
        except Exception as e:
            raise UploadUnsupported(f"docx 解析失败（加密/损坏）：{e}") from e
        if len(text) < 10:
            raise UploadUnsupported("docx 无可提取文本")
        return text, source_type

    raise UploadUnsupported(ext)  # unreachable
CHUNK_OVERLAP_CHARS = 60  # 相邻块重叠，从最近语义边界回退（借鉴 ack-agent chunker）


def _split_sentences(para: str, limit: int) -> list[str]:
    """超长段落按句切（中英文句读），仍超长的句子强制截断。"""
    import re

    parts = re.split(r"(?<=[。；？！.!?;])\s*", para)
    sentences: list[str] = []
    for part in parts:
        while len(part) > limit:
            sentences.append(part[:limit])
            part = part[limit:]
        if part.strip():
            sentences.append(part)
    return sentences


def _overlap_tail(text: str, overlap: int) -> str:
    """取块尾 overlap 字符，并回退到最近语义边界（换行/句读），保证衔接处完整。"""
    tail = text[-overlap:]
    cut = max(tail.rfind("\n"), tail.rfind("。"), tail.rfind("；"), tail.rfind("."))
    return tail[cut + 1 :] if cut > 0 else tail


def split_chunks(content: str, target: int = CHUNK_TARGET_CHARS) -> list[str]:
    """三级分块（借鉴 ack-agent 生产验证）：段落 → 单段超长按句 → 句超长硬截，
    相邻块携带 overlap（语义边界回退），避免边界语义被切断检索不到。"""
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    units: list[str] = []
    for para in paragraphs:
        if len(para) <= target:
            units.append(para)
        else:
            units.extend(_split_sentences(para, target))

    chunks: list[str] = []
    buf = ""
    for unit in units:
        if not buf:
            buf = unit
        elif len(buf) + len(unit) + 1 <= target:
            buf = f"{buf}\n{unit}"
        else:
            chunks.append(buf.strip())
            buf = f"{_overlap_tail(buf, CHUNK_OVERLAP_CHARS)}\n{unit}" if CHUNK_OVERLAP_CHARS else unit
    if buf.strip():
        chunks.append(buf.strip())
    return chunks or [content[:target]]


async def create_document(
    db: AsyncSession,
    req: CropDocumentCreate,
    user_id: int | None,
    original_file: tuple[str, str, bytes] | None = None,
) -> CropDocument:
    """吞入+消化：建文档 → 分块 → embedding → 存权威 → 投影到 Redis。

    original_file=(filename, mime, bytes)：上传原件随权威一起落库
    （预览/下载用）；文本粘贴无原件。
    """
    doc = CropDocument(
        title=req.title,
        source_type=req.source_type,
        content=req.content,
        visible_roles=(req.visible_roles or "").strip() or None,
        size_bytes=len(req.content.encode("utf-8")),
        status="embedding",
        created_by=user_id,
        **(
            dict(zip(("original_filename", "file_mime", "file_blob"), original_file))
            if original_file
            else {}
        ),
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)  # server_default 字段回读（见 01 文档铁坑）

    chunks = split_chunks(req.content)
    try:
        vectors, _mock = await embed_texts(chunks)
        for seq, (text, vec) in enumerate(zip(chunks, vectors)):
            chunk = CropChunk(
                document_id=doc.id,
                seq=seq,
                content=text,
                token_count=len(text),
                embedding=pack_vector(vec),
                embedding_model="mock" if _mock else "api",
            )
            db.add(chunk)
        doc.chunk_count = len(chunks)
        doc.status = "ready"
    except Exception as exc:
        doc.status = "failed"
        doc.error = str(exc)[:500]
        await db.flush()
        raise

    await db.flush()
    # 权威已落库（事务内），投影事务外追加（投影可丢，失败不影响权威）
    rows = (
        await db.execute(
            select(CropChunk.id, CropChunk.embedding).where(
                CropChunk.document_id == doc.id
            )
        )
    ).all()
    for chunk_id, packed in rows:
        await crop_vector_store.add(chunk_id, packed)
    logger.info(
        "crop_ingested", document_id=doc.id, chunks=len(chunks)
    )
    return doc


async def list_documents(
    db: AsyncSession, limit: int = 20, offset: int = 0, user: User | None = None
) -> tuple[list[CropDocument], int]:
    vis = _visible_cond(user)
    base = select(CropDocument)
    count_q = select(func.count(CropDocument.id))
    if vis is not None:
        base = base.where(vis)
        count_q = count_q.where(vis)
    total = (await db.execute(count_q)).scalar_one()
    rows = (
        await db.execute(
            base.order_by(CropDocument.id.desc()).limit(limit).offset(offset)
        )
    ).scalars().all()
    return list(rows), total


async def get_document(
    db: AsyncSession, doc_id: int, user: User | None = None
) -> CropDocument | None:
    doc = await db.get(CropDocument, doc_id)
    if doc is None:
        return None
    vis = _visible_cond(user)
    if vis is not None:
        # 逐条判可见性（详情是点查，不做 SQL——FIND_IN_SET 语义复用）
        roles = (doc.visible_roles or "").strip()
        if roles and user is not None and user.role != "admin":
            if user.role not in [r.strip() for r in roles.split(",")]:
                return None
    return doc


async def get_chunks(db: AsyncSession, doc_id: int) -> list[CropChunk]:
    rows = (
        await db.execute(
            select(CropChunk)
            .where(CropChunk.document_id == doc_id)
            .order_by(CropChunk.seq)
        )
    ).scalars().all()
    return list(rows)


async def delete_document(db: AsyncSession, doc_id: int) -> bool:
    """删权威（chunk 级联）+ 删投影。"""
    doc = await get_document(db, doc_id)
    if doc is None:
        return False
    chunk_ids = (
        await db.execute(select(CropChunk.id).where(CropChunk.document_id == doc_id))
    ).scalars().all()
    await db.execute(delete(CropChunk).where(CropChunk.document_id == doc_id))
    await db.delete(doc)
    for cid in chunk_ids:
        await crop_vector_store.drop_chunk(cid)
    return True


def _query_terms(query: str) -> list[str]:
    """查询拆短语：按空白/标点切，取 ≥2 字片段（关键词召回用），最多 5 个。"""
    import re

    segs = [s for s in re.split(r"[\s，。；、,.;?？!！\n\r]+", query) if len(s) >= 2]
    return segs[:5] or ([query] if query.strip() else [])


_LIKE_ESCAPES = str.maketrans({"\\": "\\\\", "%": "\\%", "_": "\\_"})


def _visible_cond(user: User | None):
    """检索前过滤：admin 恒全量；visible_roles 空=全库共享；
    否则 FIND_IN_SET(user.role, visible_roles)。「检索前过滤才是真正的数据隔离」。"""
    if user is None or user.role == "admin":
        return None  # 不过滤
    from sqlalchemy import func as _func

    return or_(
        CropDocument.visible_roles.is_(None),
        CropDocument.visible_roles == "",
        _func.find_in_set(user.role, CropDocument.visible_roles) > 0,
    )


async def search(
    db: AsyncSession, query: str, top_k: int = 5, user: User | None = None
) -> tuple[list[dict], bool]:
    """混合检索：向量 KNN + MySQL 关键词召回 → RRF 融合。

    纯向量对编号/术语类查询弱（embedding 对「GB4452」这类 token 不敏感），
    关键词 LIKE 兑底；RRF（k=60）融合两路排名，score 字段 = RRF 分（越大越相关）。
    权限分域（v0.11.1+）：投影不存权限——向量通道扩召回 top_k×3 回表过滤，
    权威/投影分离原则不变（投影可丢弃，权限永远在权威侧）。
    """
    from app.schemas.response import CropSearchHit

    vectors, mock = await embed_texts([query])
    packed = pack_vector(vectors[0])
    vec_hits = await crop_vector_store.search(
        packed, top_k * 3 if user is not None else top_k
    )
    vis = _visible_cond(user)

    # 关键词召回（chunk 量级 demo 规模，LIKE 零成本；通配符转义防语义漂移）
    terms = _query_terms(query)
    kw_ids: list[int] = []
    if terms:
        cond = or_(
            *(
                CropChunk.content.like(f"%{t.translate(_LIKE_ESCAPES)}%", escape="\\")
                for t in terms
            )
        )
        kw_q = (
            select(CropChunk.id)
            .join(CropDocument, CropChunk.document_id == CropDocument.id)
            .where(cond)
            .order_by(CropChunk.id.desc())
            .limit(top_k)
        )
        if vis is not None:
            kw_q = kw_q.where(vis)
        kw_ids = list((await db.execute(kw_q)).scalars().all())

    if not vec_hits and not kw_ids:
        return [], mock

    rrf: dict[int, float] = {}
    for rank, (cid, _sim) in enumerate(vec_hits):
        rrf[cid] = rrf.get(cid, 0.0) + 1.0 / (60 + rank + 1)
    for rank, cid in enumerate(kw_ids):
        rrf[cid] = rrf.get(cid, 0.0) + 1.0 / (60 + rank + 1)
    ranked = sorted(rrf.items(), key=lambda kv: kv[1], reverse=True)[:top_k]

    stmt = (
        select(CropChunk, CropDocument)
        .join(CropDocument, CropChunk.document_id == CropDocument.id)
        .where(CropChunk.id.in_([cid for cid, _ in ranked]))
    )
    if vis is not None:
        stmt = stmt.where(vis)
    rows = (await db.execute(stmt)).all()
    by_id = {chunk.id: (chunk, doc) for chunk, doc in rows}
    results: list[CropSearchHit] = []
    for cid, score in ranked:  # 保持融合排序
        pair = by_id.get(cid)
        if pair is None:
            continue  # 投影与权威短暂不一致（重建窗口），跳过
        chunk, doc = pair
        results.append(
            CropSearchHit(
                chunk_id=chunk.id,
                document_id=doc.id,
                document_title=doc.title,
                seq=chunk.seq,
                content=chunk.content,
                score=round(score, 4),
            )
        )
    return [r.model_dump() for r in results], mock


async def rebuild_projection(db: AsyncSession) -> int:
    """从 MySQL 权威全量重建 Redis 投影（运维/灾后备手）。"""
    rows = (
        await db.execute(select(CropChunk.id, CropChunk.embedding))
    ).all()
    return await crop_vector_store.rebuild(rows)


async def projection_health() -> dict:
    """投影健康（管理端观测）。"""
    return {"vector_set": crop_vector_store.VECTOR_KEY, "count": await crop_vector_store.card()}


ASK_SYSTEM_PROMPT = (
    "你是 PeriNest 的知识库共生体（Crop 嗉囊：先吞后消化）。回答规则：\n"
    "1. 只基于 crop_search 工具检索到的知识库内容回答；知识库没有的，明确说「知识库中没有相关内容」，禁止编造。\n"
    "2. 检索结果不理想时，换同义词或更短的关键词再检索（最多 3 轮），之后必须作答。\n"
    "3. 回答末尾另起一行列出引用，格式「来源：《文档标题》#分块序号」，只列实际用到的。\n"
    "4. 与用户提问同语言，简洁、结构化。\n"
    "5. 回答的第一个字符就是答案正文。严禁元描述开场（「我先检索一下」「让我查查」「根据检索结果」等一律禁止）——检索过程系统已实时展示给用户，你无需复述任何过程，直接给结论。"
)
MAX_ASK_TURNS = 4  # 工具循环轮次上限（最后一轮不给工具，逼直答）


async def ask_stream(
    db: AsyncSession,
    user: User,
    query: str,
    history: list,
    top_k: int = 5,
    session_id: str | None = None,
    source: str = "crop_ask",
):
    """知识库问答：agentic 检索循环（方案②）——AI 自主决定检索什么、检索几轮。

    yield SSE 事件：{"tool_call": ...} | {"delta": ...} | {"citations": ...}。
    session_id 有值时：先加载会话历史（覆盖 history 参数），成功后追加消息入库；
    用量（token/轮次/工具次数）落 pn_agent_usage（fire-and-forget，不炸主链路）。
    无真实 LLM 抛 AIServiceUnavailable（fail-closed：不 mock 假答案）。
    """
    from app.core.permissions import effective_permissions, has_permission
    from app.services import agent_service, agent_tools
    from app.services.ai_service import ai_service

    perms = await effective_permissions(user, db)
    tools = await agent_tools.tools_for_user(perms)
    specs = [t.openai_spec() for t in tools]
    handlers = {t.name: t for t in tools}
    citations: dict[int, dict] = {}  # chunk_id -> hit，跨轮去重
    round_no = 0
    tool_calls_n = 0
    usage: dict = {}  # 末轮 usage 事件
    answer_parts: list[str] = []

    if session_id:
        history = await agent_service.load_history(db, session_id, user)

    async def execute_tool(name: str, args: dict) -> dict:
        """工具执行统一收口：权限门 → handler（异常兜底）→ 审计留痕。"""
        tool = handlers.get(name)
        if tool is None:
            await agent_service.audit_tool_call(user.id, name, args, ok=False, preview="unknown tool")
            return {"error": f"unknown tool: {name}"}
        if tool.perm is not None and not has_permission(perms, tool.perm):
            await agent_service.audit_tool_call(
                user.id, name, args, denied=True, preview=f"缺少权限 {tool.perm}"
            )
            return {"denied": True, "reason": f"缺少权限 {tool.perm}"}
        try:
            result = await tool.handler(db, user, args)
        except Exception as e:  # noqa: BLE001 — 工具异常转结果给 LLM，不炸问答链路
            await agent_service.audit_tool_call(user.id, name, args, ok=False, preview=str(e))
            return {"error": f"工具执行失败: {e}"}
        if name == "crop_search":
            for h in result.get("hits", []):
                citations[h["chunk_id"]] = h
        await agent_service.audit_tool_call(
            user.id, name, args, preview=str(result.get("denied") or "ok")
        )
        return result

    def _norm(m) -> dict:
        """history 兼容归一：AskMessage(Pydantic) / dict(load_history) 两种形态。"""
        return (
            {"role": m["role"], "content": m["content"]}
            if isinstance(m, dict)
            else {"role": m.role, "content": m.content}
        )

    messages: list[dict] = [
        {"role": "system", "content": ASK_SYSTEM_PROMPT},
        *(_norm(m) for m in history),
        {"role": "user", "content": query},
    ]

    async for ev in ai_service.stream_chat_with_tools(
        messages, specs, execute_tool, max_turns=MAX_ASK_TURNS
    ):
        if ev["type"] == "tool_call":
            tool_calls_n += 1
            if ev["name"] == "crop_search":
                round_no += 1
                yield {
                    "tool_call": {
                        "name": ev["name"],
                        "round": round_no,
                        "query": str(ev["args"].get("query", "")),
                    }
                }
            # 其余工具（get_me/web_search/list_orders）内部消化，协议面最小
        elif ev["type"] == "delta":
            answer_parts.append(ev["text"])
            yield {"delta": ev["text"]}
        elif ev["type"] == "usage":
            usage = ev

    ranked = sorted(
        citations.values(), key=lambda h: h["score"], reverse=True
    )[:top_k]
    yield {"citations": ranked}

    # 问答成功：记账 + 会话追加（观测失败不炸主链路；消息随端点事务提交）
    if usage:
        await agent_service.record_usage(
            user_id=user.id,
            source=source,
            model=usage.get("model", ""),
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            rounds=round_no,
            tool_calls=tool_calls_n,
        )
    if session_id:
        await agent_service.append_messages(
            db, session_id, user, query, "".join(answer_parts)
        )


async def ask(
    db: AsyncSession,
    user: User,
    query: str,
    history: list,
    top_k: int = 5,
    session_id: str | None = None,
    source: str = "crop_ask",
) -> tuple[str, list[dict]]:
    """非流式问答：聚合 ask_stream，返回 (answer, citations)。"""
    parts: list[str] = []
    citations: list[dict] = []
    async for ev in ask_stream(db, user, query, history, top_k, session_id, source):
        if "delta" in ev:
            parts.append(ev["delta"])
        elif "citations" in ev:
            citations = ev["citations"]
    return "".join(parts), citations
