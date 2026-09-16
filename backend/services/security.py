"""Token encryption-at-rest. Connector access/refresh tokens are stored
Fernet-encrypted when FERNET_KEY is set; in dev (no key) they fall back to
plaintext so the app still runs — never do that in prod."""
import os
from dotenv import load_dotenv

load_dotenv()
_KEY = os.getenv("FERNET_KEY") or ""
_fernet = None
if _KEY:
    try:
        from cryptography.fernet import Fernet
        _fernet = Fernet(_KEY.encode())
    except Exception:
        _fernet = None


def encrypt(plain: str | None) -> str | None:
    if not plain:
        return plain
    if _fernet:
        return "enc:" + _fernet.encrypt(plain.encode()).decode()
    return plain


def decrypt(stored: str | None) -> str | None:
    if not stored:
        return stored
    if stored.startswith("enc:") and _fernet:
        try:
            return _fernet.decrypt(stored[4:].encode()).decode()
        except Exception:
            return None
    return stored
