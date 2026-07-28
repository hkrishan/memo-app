#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PODFILE="$ROOT_DIR/ios/Podfile"
PROPS="$ROOT_DIR/ios/Podfile.properties.json"
APP_PROJECT="$ROOT_DIR/ios/Memo.xcodeproj/project.pbxproj"
APP_DELEGATE="$ROOT_DIR/ios/Memo/AppDelegate.swift"

if [[ ! -f "$PODFILE" ]]; then
  echo "Podfile not found at $PODFILE" >&2
  exit 1
fi

# 1) Ensure ios.deploymentTarget is 16.0 in Podfile.properties.json
if [[ -f "$PROPS" ]]; then
  PROPS_PATH="$PROPS" python3 - <<'PY'
import json, os, pathlib

props_path = pathlib.Path(os.environ["PROPS_PATH"])
props = json.loads(props_path.read_text()) if props_path.exists() else {}
if props.get("ios.deploymentTarget") != "16.0":
    props["ios.deploymentTarget"] = "16.0"
    props_path.write_text(json.dumps(props, indent=2) + "\n")
PY
fi

# 1b/2/3) Normalize Podfile: platform 16.0, drop stale Galeria pod, and post_install target tweak
PODFILE_PATH="$PODFILE" python3 - <<'PY'
from pathlib import Path
import os
import re

podfile_path = Path(os.environ["PODFILE_PATH"])
text = podfile_path.read_text()

# Ensure platform is 16.0
text = re.sub(r"platform :ios,.*", "platform :ios, '16.0'", text, count=1)

# Remove any Galeria pod line — the package is no longer a dependency and
# a leftover line breaks pod install ("No podspec found for Galeria")
text = re.sub(r"^\s*pod ['\"]Galeria['\"].*\n", "", text, flags=re.MULTILINE)

# Normalize post_install block and force deployment target to 16.0
post_install_block = """  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
      end
    end
  end
end
"""

text = re.sub(r"post_install do \|installer\|[\s\S]*?end\s*end\s*$", post_install_block.strip() + "\n", text, count=1)

podfile_path.write_text(text)
PY

echo "Patched Podfile and Podfile.properties.json for iOS 16.0 (Galeria removed if present)."

# 4) Bump app target deployment target in memoapp.xcodeproj to 16.0
if [[ -f "$APP_PROJECT" ]]; then
  APP_PROJECT_PATH="$APP_PROJECT" python3 - <<'PY'
from pathlib import Path
import os

proj_path = Path(os.environ["APP_PROJECT_PATH"])
text = proj_path.read_text()
text = text.replace("IPHONEOS_DEPLOYMENT_TARGET = 15.1;", "IPHONEOS_DEPLOYMENT_TARGET = 16.0;")
proj_path.write_text(text)
PY
fi

# 5) Comment out sourceURL method in AppDelegate.swift (causes issues with expo-dev-client)
if [[ -f "$APP_DELEGATE" ]]; then
  APP_DELEGATE_PATH="$APP_DELEGATE" python3 - <<'PY'
from pathlib import Path
import os
import re

delegate_path = Path(os.environ["APP_DELEGATE_PATH"])
text = delegate_path.read_text()

# Match the whole (uncommented) sourceURL override regardless of its exact
# body — RCTBridge is not visible to Swift with static frameworks, so the
# override must not compile. Already-commented lines won't match.
source_url_pattern = re.compile(
    r'^([ \t]*)override func sourceURL\(for bridge: RCTBridge\) -> URL\? \{.*?\n[ \t]*\}[ \t]*$',
    re.MULTILINE | re.DOTALL,
)

match = source_url_pattern.search(text)
if match:
    block = match.group(0)
    commented = "\n".join(
        re.sub(r"^([ \t]*)", r"\1// ", line, count=1) if line.strip() else line
        for line in block.splitlines()
    )
    text = text.replace(block, commented)
    delegate_path.write_text(text)
    print("Commented out sourceURL method in AppDelegate.swift")
else:
    print("sourceURL method already commented out or not found")
PY
  echo "Patched AppDelegate.swift to comment out sourceURL method."
fi

# 6) Patch React Native's spm.rb to add nil checks for targets
SPM_RB="$ROOT_DIR/node_modules/react-native/scripts/cocoapods/spm.rb"
if [[ -f "$SPM_RB" ]]; then
  SPM_RB_PATH="$SPM_RB" python3 - <<'PY'
from pathlib import Path
import os

spm_path = Path(os.environ["SPM_RB_PATH"])
text = spm_path.read_text()

# Check if already patched (look for our nil check)
if "next unless target" in text:
    print("spm.rb already patched")
else:
    # Patch 1: Add nil check after finding target in the loop on lines 25-41
    old_code1 = """      dependencies.each do |spm_spec|
        log "Adding SPM dependency on product #{spm_spec[:products]}"
        add_spm_to_target(
          project,
          project.targets.find { |t| t.name == pod_name},
          spm_spec[:url],
          spm_spec[:requirement],
          spm_spec[:products]
        )
        log " Adding workaround for Swift package not found issue"
        target = project.targets.find { |t| t.name == pod_name}
        target.build_configurations.each do |config|"""

    new_code1 = """      dependencies.each do |spm_spec|
        target = project.targets.find { |t| t.name == pod_name}
        next unless target  # Skip if target not found

        log "Adding SPM dependency on product #{spm_spec[:products]}"
        add_spm_to_target(
          project,
          target,
          spm_spec[:url],
          spm_spec[:requirement],
          spm_spec[:products]
        )
        log " Adding workaround for Swift package not found issue"
        target.build_configurations.each do |config|"""

    text = text.replace(old_code1, new_code1)

    # Patch 2: Add nil check in add_spm_to_target function
    old_code2 = """  def add_spm_to_target(project, target, url, requirement, products)
    pkg_class = Xcodeproj::Project::Object::XCRemoteSwiftPackageReference
    ref_class = Xcodeproj::Project::Object::XCSwiftPackageProductDependency
    pkg = project.root_object.package_references.find { |p| p.class == pkg_class && p.repositoryURL == url }"""

    new_code2 = """  def add_spm_to_target(project, target, url, requirement, products)
    return unless target  # Guard against nil target

    pkg_class = Xcodeproj::Project::Object::XCRemoteSwiftPackageReference
    ref_class = Xcodeproj::Project::Object::XCSwiftPackageProductDependency
    pkg = project.root_object.package_references.find { |p| p.class == pkg_class && p.repositoryURL == url }"""

    text = text.replace(old_code2, new_code2)

    spm_path.write_text(text)
    print("Patched spm.rb with nil checks for targets")
PY
  echo "Patched React Native spm.rb for nil target handling."
fi

# 7) Local builds have no SENTRY_ORG/PROJECT/AUTH_TOKEN (those live on EAS),
# so sentry-cli fails the "Bundle React Native code and images" phase. Xcode
# script phases source .xcode.env.local, so the opt-out goes there — and here,
# because `expo prebuild --clean` deletes ios/ along with it.
XCODE_ENV_LOCAL="$ROOT_DIR/ios/.xcode.env.local"
if [[ -d "$ROOT_DIR/ios" ]]; then
  if ! grep -q "SENTRY_DISABLE_AUTO_UPLOAD" "$XCODE_ENV_LOCAL" 2>/dev/null; then
    {
      echo "# Source maps upload on EAS, where the Sentry env vars exist."
      echo "export SENTRY_DISABLE_AUTO_UPLOAD=true"
    } >> "$XCODE_ENV_LOCAL"
    echo "Added SENTRY_DISABLE_AUTO_UPLOAD to ios/.xcode.env.local"
  else
    echo "SENTRY_DISABLE_AUTO_UPLOAD already set in ios/.xcode.env.local"
  fi
fi
