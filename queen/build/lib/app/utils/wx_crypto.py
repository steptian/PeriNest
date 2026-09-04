"""微信数据解密工具（Antenna 端手机号/运动数据等 encryptedData）。"""
import base64
import hashlib
import json

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


class WxCryptoError(Exception):
    pass


def decrypt_wx_data(session_key: str, encrypted_data: str, iv: str) -> dict:
    """AES-128-CBC 解密微信加密数据。

    :param session_key: wx.login 后端换取的 session_key（base64）
    :param encrypted_data: 前端传来的 encryptedData（base64）
    :param iv: 前端传来的 iv（base64）
    """
    try:
        key = base64.b64decode(session_key)
        cipher = Cipher(algorithms.AES(key), modes.CBC(base64.b64decode(iv)))
        decryptor = cipher.decryptor()
        raw = decryptor.update(base64.b64decode(encrypted_data)) + decryptor.finalize()
    except Exception as e:
        raise WxCryptoError(f"解密失败: {e}") from e
    # 去除 PKCS#7 padding
    pad_len = raw[-1]
    plain = raw[:-pad_len]
    data = json.loads(plain)
    # 官方要求校验 watermark
    watermark = data.get("watermark", {})
    if not watermark.get("appid"):
        raise WxCryptoError("watermark 校验失败，数据可能被篡改")
    return data


def signature(session_key: str, raw_data: str) -> str:
    """校验前端 rawData 签名：sha1(session_key + rawData)。"""
    return hashlib.sha1((session_key + raw_data).encode()).hexdigest()
