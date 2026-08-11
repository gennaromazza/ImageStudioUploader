const path = require("path");
const { rcedit } = require("rcedit");

exports.default = async function applyWindowsExecutableIcon(context) {
  if (context.electronPlatformName !== "win32") return;

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(
    context.packager.projectDir,
    "assets",
    "icon-uploader-v1",
    "generated",
    "icons",
    "icon.ico"
  );

  await rcedit(exePath, { icon: iconPath });
};
