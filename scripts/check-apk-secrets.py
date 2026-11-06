"""Read-only release check. Output findings/roles, never credential values."""
import base64
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

apk = Path(sys.argv[1])
findings, roles = [], set()
checked = 0
with zipfile.ZipFile(apk) as archive:
    for name in archive.namelist():
        if re.search(r'(?:\.jks|\.keystore|\.p12|signing\.properties|/\.env)$|/\.git/', name):
            findings.append(name + ': private configuration file')
        if not name.endswith(('.js', '.mjs', '.json', '.html', '.md', '.txt', '.xml', '.dex')):
            continue
        data = archive.read(name)
        checked += 1
        if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?<![A-Za-z0-9+/])AKID[A-Za-z0-9]{28,40}(?![A-Za-z0-9+/])', data):
            findings.append(name + ': possible private key or Tencent credential')
        for match in re.finditer(rb'eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]{16,}', data):
            try:
                part = match[1]
                claims = json.loads(base64.urlsafe_b64decode(part + b'=' * (-len(part) % 4)))
            except (ValueError, UnicodeError):
                continue
            role = claims.get('role', 'unknown')
            roles.add(role)
            if role != 'anon' or claims.get('is_system_admin'):
                findings.append(name + ': non-public JWT embedded')
        if re.search(rb'(?:SecretKey|secret_key|api_key|password)\s*[=:]\s*["\'][A-Za-z0-9/+_-]{28,}["\']', data, re.I):
            findings.append(name + ': possible hardcoded server credential')
print(json.dumps({'apk':str(apk),'sha256':hashlib.file_digest(apk.open('rb'),'sha256').hexdigest(),'text_and_dex_entries':checked,'embedded_jwt_roles':sorted(roles),'findings':sorted(set(findings))},ensure_ascii=False,indent=2))
sys.exit(1 if findings else 0)
