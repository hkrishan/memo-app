#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PODFILE="$ROOT_DIR/ios/Podfile"
PROPS="$ROOT_DIR/ios/Podfile.properties.json"
APP_PROJECT="$ROOT_DIR/ios/memoapp.xcodeproj/project.pbxproj"
APP_DELEGATE="$ROOT_DIR/ios/memoapp/AppDelegate.swift"

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

# 1b/2/3) Normalize Podfile: platform 16.0, Galeria pod path, and post_install target tweak
PODFILE_PATH="$PODFILE" python3 - <<'PY'
from pathlib import Path
import os
import re

podfile_path = Path(os.environ["PODFILE_PATH"])
text = podfile_path.read_text()

# Ensure platform is 16.0
text = re.sub(r"platform :ios,.*", "platform :ios, '16.0'", text, count=1)

galeria_line = "  pod 'Galeria', :path => '../node_modules/@nandorojo/galeria/ios'"

# Normalize existing Galeria line
text = re.sub(r"^\s*pod ['\"]Galeria['\"].*$", galeria_line, text, flags=re.MULTILINE)

# Insert Galeria before use_react_native! if missing
if "Galeria" not in text:
    text = re.sub(r"\n(\s*use_react_native!)", f"\n{galeria_line}\n\\1", text, count=1)

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

echo "Patched Podfile and Podfile.properties.json for iOS 16.0 and Galeria."

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

# Pattern to match the sourceURL method (uncommented)
source_url_pattern = r'(\s*)override func sourceURL\(for bridge: RCTBridge\) -> URL\? \{\s*\n\s*// needed to return the correct URL for expo-dev-client\.\s*\n\s*bridge\.bundleURL \?\? bundleURL\(\)\s*\n\s*\}'

# Check if the method exists and is not already commented out
if re.search(source_url_pattern, text):
    # Comment out the method
    def comment_out(match):
        indent = match.group(1)
        return f'''{indent}// override func sourceURL(for bridge: RCTBridge) -> URL? {{
{indent}//   // needed to return the correct URL for expo-dev-client.
{indent}//   bridge.bundleURL ?? bundleURL()
{indent}// }}'''

    text = re.sub(source_url_pattern, comment_out, text)
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
