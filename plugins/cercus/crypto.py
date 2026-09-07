"""企微回调消息加解密（Cercus 尾须 · 干净实现，企微官方算法）。

自 JJKK wecom-sidebar 移植（生产验证版）。依赖 pycryptodome。

算法：
- AESKey = base64decode(aeskey_43字符 + "=") → 32字节；AES-256-CBC；IV = key[:16]
- PKCS7 pad 到 32 倍数
- 明文结构：random(16) + msg_len(4, big-endian) + msg(utf-8) + corpid(utf-8)
- 签名：sha1("".join(sorted([token, timestamp, nonce, encrypt_b64])))
"""
import base64
import hashlib
import os
import struct
from Crypto.Cipher import AES

_BLOCK = 32


def _key(aeskey: str) -> bytes:
    return base64.b64decode(aeskey + "=")


def _pkcs7_pad(data: bytes) -> bytes:
    pad = _BLOCK - (len(data) % _BLOCK)
    return data + bytes([pad]) * pad


def _pkcs7_unpad(data: bytes) -> bytes:
    pad = data[-1]
    return data[:-pad]


def sign(token: str, timestamp: str, nonce: str, encrypt: str) -> str:
    """计算回调签名。"""
    return hashlib.sha1("".join(sorted([token, timestamp, nonce, encrypt])).encode()).hexdigest()


def verify(token: str, timestamp: str, nonce: str, encrypt: str, signature: str) -> bool:
    return sign(token, timestamp, nonce, encrypt) == signature


def decrypt(aeskey: str, corpid: str, encrypt_b64: str) -> str:
    """解密 base64 密文 → 明文 msg；校验 corpid。"""
    key = _key(aeskey)
    cipher = AES.new(key, AES.MODE_CBC, key[:16])
    plain = _pkcs7_unpad(cipher.decrypt(base64.b64decode(encrypt_b64)))
    msg_len = struct.unpack(">I", plain[16:20])[0]
    msg = plain[20:20 + msg_len].decode("utf-8")
    from_corpid = plain[20 + msg_len:].decode("utf-8")
    if from_corpid != corpid:
        raise ValueError(f"corpid 校验失败: {from_corpid} != {corpid}")
    return msg


def encrypt_msg(aeskey: str, corpid: str, msg: str) -> str:
    """加密 msg → base64 密文（回复/测试用）。"""
    key = _key(aeskey)
    msg_b = msg.encode("utf-8")
    plain = os.urandom(16) + struct.pack(">I", len(msg_b)) + msg_b + corpid.encode("utf-8")
    cipher = AES.new(key, AES.MODE_CBC, key[:16])
    return base64.b64encode(cipher.encrypt(_pkcs7_pad(plain))).decode()
