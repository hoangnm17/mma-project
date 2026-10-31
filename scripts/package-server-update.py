"""Package current source for an in-place server update; never include secrets."""
import hashlib
import io
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parent.parent
output = root / "artifacts" / "StayFlow-update-20261031.tar.gz"
entries = [
    "backend", "frontend", "deploy", "scripts", "docs",
    "package.json", "package-lock.json", "Dockerfile", "compose.yaml",
    "eslint.config.js", ".dockerignore", ".easignore", ".gitignore", "README.md", "AGENTS.md",
]
excluded = {"node_modules", ".git", ".expo", "artifacts", "dist", "__pycache__", ".aws", ".codex", ".agents"}
private_suffixes = {".pem", ".key", ".jks", ".keystore", ".p12", ".pfx", ".p8"}

def allowed(name):
    path = pathlib.PurePosixPath(name)
    return (not path.is_absolute() and ".." not in path.parts
            and not any(part in excluded for part in path.parts)
            and not (path.name.startswith(".env") and path.name != ".env.example")
            and path.suffix.lower() not in private_suffixes
            and path.name not in {"credentials.json", "google-services.json"}
            and not path.name.startswith("service-account"))

manifest = {"version": "1.0.1", "versionCode": 3,
            "easBuildId": "d43374ec-ea1c-46cb-883e-5342fe844a5d", "sha256": {}}

def prepare(info):
    if not allowed(info.name) or info.issym() or info.islnk():
        return None
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    info.mode = 0o755 if info.isdir() else 0o644
    if info.isfile():
        manifest["sha256"][info.name] = hashlib.sha256((root / info.name).read_bytes()).hexdigest()
    return info

output.parent.mkdir(exist_ok=True)
with tarfile.open(output, "w:gz") as archive:
    for entry in entries:
        archive.add(root / entry, arcname=entry, filter=prepare)
    release = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    metadata = tarfile.TarInfo("RELEASE-MANIFEST.json")
    metadata.size = len(release)
    metadata.mode = 0o644
    archive.addfile(metadata, io.BytesIO(release))

with tarfile.open(output) as archive:
    members = archive.getmembers()
    assert all(allowed(member.name) and not member.issym() and not member.islnk() for member in members)
    for required in ["backend/migrations/002_mongo.js", "backend/migrations/001_mongo.schema.snapshot", "backend/migrations/002_mongo.schema.snapshot", "frontend/src/app/_layout.jsx", "frontend/package-lock.json", "Dockerfile"]:
        assert archive.extractfile(required).read() == (root / required).read_bytes(), required
    assert "deploy/.env" not in archive.getnames()
    assert "backend/.env" not in archive.getnames()
    assert "backend/.env.gemini" not in archive.getnames()
    private_ai = root / "backend" / ".env.gemini"
    if private_ai.exists():
        secrets = [line.split("=", 1)[1].strip().encode() for line in private_ai.read_text(encoding="utf-8").splitlines() if line.startswith("GEMINI_API_KEY=")]
        for member in members:
            if member.isfile():
                data = archive.extractfile(member).read()
                assert all(not secret or secret not in data for secret in secrets), "Private AI key entered the public source archive"

digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix(output.suffix + ".sha256").write_text(digest + "  " + output.name + "\n", encoding="utf-8")
print(f"Verified server source: {len(manifest['sha256'])} files, {output.stat().st_size} bytes")
print(output)
print("SHA256", digest)
