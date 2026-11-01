"""Build a source-only deploy ZIP and verify its manifest and secret exclusions."""
import hashlib
import json
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
config = json.loads((root / "frontend/config/app-base.json").read_text(encoding="utf-8"))["expo"]
version = config["version"]
output = root / "artifacts" / f"StayFlow-{version}-autoseed-deploy.zip"
entries = ["backend", "frontend", "deploy", "scripts", "docs", "package.json", "package-lock.json",
           "Dockerfile", "compose.yaml", "compose.deploy.yaml", "eslint.config.js", ".dockerignore", ".easignore", ".gitignore", "README.md", "AGENTS.md"]
excluded = {"node_modules", ".git", ".expo", "artifacts", "dist", "__pycache__", ".aws", ".codex", ".agents", "android", "ios"}
private_suffixes = {".pem", ".key", ".jks", ".keystore", ".p12", ".pfx", ".p8"}


def allowed(path):
    return (not path.is_absolute() and ".." not in path.parts
            and not any(part in excluded for part in path.parts)
            and not (path.name.startswith(".env") and path.name != ".env.example")
            and path.suffix.lower() not in private_suffixes
            and path.name not in {"credentials.json", "google-services.json"}
            and not path.name.startswith("service-account"))


# Values are used only for verification, never written into archive/log/manifest.
secrets = []
for directory in [root / "backend", root / "frontend", root / "deploy"]:
    for env in directory.glob(".env*"):
        if not env.is_file() or env.name == ".env.example":
            continue
        for line in env.read_text(encoding="utf-8-sig").splitlines():
            key, separator, value = line.partition("=")
            value = value.strip().strip("\"'")
            if separator and ("SECRET" in key or "PASSWORD" in key or "API_KEY" in key) and len(value) >= 16:
                if not value.startswith(("replace", "your-", "<")):
                    secrets.append(value.encode())

files = {}
redacted_documents = 0
for entry in entries:
    item = root / entry
    candidates = item.rglob("*") if item.is_dir() else [item]
    for file in candidates:
        name = file.relative_to(root)
        if file.is_file() and not file.is_symlink() and allowed(name):
            data = file.read_bytes()
            if name.parts[0] == "docs" and file.suffix in {".md", ".json"}:
                original = data
                for secret in secrets:
                    data = data.replace(secret, b"<REDACTED_ENV_VALUE>")
                redacted_documents += data != original
            assert all(secret not in data for secret in secrets), f"Private env value found in {name}"
            files[name.as_posix()] = data

files["compose.local.yaml"] = files["compose.yaml"]
files["compose.yaml"] = files["compose.deploy.yaml"]
build_file = root / "artifacts" / f"eas-release-{version}-build.json"
build = json.loads(build_file.read_text(encoding="utf-8-sig"))[0] if build_file.exists() else {}
manifest = {"version": version, "versionCode": config["android"]["versionCode"],
            "easBuildId": build.get("id"), "apiOrigin": "https://3.26.69.81.sslip.io",
            "deploymentMode": "automatic-demo-seed", "composeProject": "deploy", "databaseDefault": "StayFlowDemoV3",
            "sha256": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
files["RELEASE-MANIFEST.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
files["DEPLOY-README.md"] = files["docs/deploy-autoseed.md"]
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(name)
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert all(allowed(pathlib.PurePosixPath(name)) for name in archive.namelist())
    for name, digest in manifest["sha256"].items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
    for required in ["backend/scripts/seed-history.js", "backend/scripts/seed-demo.js", "frontend/src/core/theme.js",
                     "backend/scripts/initialize.js", "frontend/src/features/reports/Assistant.jsx", "docs/deploy-autoseed.md", "DEPLOY-README.md"]:
        assert required in archive.namelist(), required
    assert archive.read("compose.yaml") == (root / "compose.deploy.yaml").read_bytes()
    assert archive.read("compose.local.yaml") == (root / "compose.yaml").read_bytes()
    for name in ["backend/migrations/001_mongo.js", "backend/migrations/001_mongo.schema.snapshot",
                 "backend/migrations/002_mongo.js", "backend/migrations/002_mongo.schema.snapshot"]:
        assert archive.read(name) == (root / name).read_bytes(), name

digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix(".zip.sha256").write_text(f"{digest}  {output.name}\n", encoding="utf-8")
print(json.dumps({"file": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": digest, "envExcluded": True, "secretsChecked": True,
                  "redactedDocuments": redacted_documents}, indent=2))
