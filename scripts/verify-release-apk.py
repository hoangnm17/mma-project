"""Verify the downloaded APK matches this source version and cloud release."""
import hashlib
import json
import pathlib
import re
import subprocess
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
expected = json.loads((root / "frontend/config/app-base.json").read_text(encoding="utf-8"))["expo"]
version = expected["version"]
version_code = expected["android"]["versionCode"]
apk = root / "artifacts" / f"StayFlow-{version}-code{version_code}.apk"
sdk = pathlib.Path("C:/Users/84911/AppData/Local/Android/Sdk/build-tools/36.0.0")
with zipfile.ZipFile(apk) as archive:
    bundle = archive.read("assets/index.android.bundle")
    assert b"https://3.26.69.81.sslip.io" in bundle, "Missing cloud API"
    for unwanted in [b"http://192.168.66.150:4000", b"http://127.0.0.1:4011"]:
        assert unwanted not in bundle, "Wrong API was bundled"
    config = json.loads(archive.read("assets/app.config"))
    assert config["owner"] == "hoangnm17s-team"
    assert config["extra"]["eas"]["projectId"] == "431a1384-6506-47bd-9c12-b73faeafceee"
    assert config["version"] == version
    assert config["android"]["versionCode"] == version_code
    suggestion = "Tuần tới có đông khách?"
    assert any(suggestion.encode(encoding) in bundle for encoding in ["utf-8", "utf-16-le"]), "Missing AI suggestions from this release"
    private_ai = root / "backend" / ".env.gemini"
    if private_ai.exists():
        keys = [line.split("=", 1)[1].strip().encode() for line in private_ai.read_text(encoding="utf-8").splitlines() if line.startswith("GEMINI_API_KEY=")]
        assert all(not key or (key not in bundle and key not in archive.read("assets/app.config")) for key in keys), "Private Gemini key is embedded"

signed = subprocess.run([str(sdk / "apksigner.bat"), "verify", "--verbose", "--print-certs", str(apk)], capture_output=True, text=True, check=True)
certificate = re.search(r"certificate SHA-256 digest: ([a-f0-9]+)", signed.stdout)[1]
assert certificate == "3a1776d5801a9e539d075ed9e022f766beac8f03b64302f70cc704702ec02199", "Signing certificate changed"
manifest = subprocess.run([str(sdk / "aapt2.exe"), "dump", "xmltree", str(apk), "--file", "AndroidManifest.xml"], capture_output=True, text=True, check=True).stdout
cleartext = next(line for line in manifest.splitlines() if "usesCleartextTraffic" in line)
assert "0x0" in cleartext, cleartext
badging = subprocess.run([str(sdk / "aapt2.exe"), "dump", "badging", str(apk)], capture_output=True, text=True, check=True).stdout
assert re.search(r"package: name='vn\.stayflow\.mobile' versionCode='" + str(version_code) + r"' versionName='" + re.escape(version) + "'", badging), "Android manifest version/package mismatch"
result = {"version": version, "versionCode": version_code, "cloudApi": True, "oldLanApi": False, "geminiKeyEmbedded": False,
          "sameSigningCertificate": True, "cleartextDisabled": True, "manifestVerified": True, "aiSuggestionsBundled": True,
          "bytes": apk.stat().st_size, "sha256": hashlib.sha256(apk.read_bytes()).hexdigest()}
(root / "artifacts" / f"apk-v{version_code}-verification.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
