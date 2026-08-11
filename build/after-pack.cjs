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

  const version = context.packager.appInfo.version;
  await rcedit(exePath, {
    icon: iconPath,
    "file-version": version,
    "product-version": version,
    "version-string": {
      CompanyName: "Image Studio",
      FileDescription: "Image Studio Uploader",
      InternalName: "Image Studio Uploader",
      OriginalFilename: "Image Studio Uploader.exe",
      ProductName: "Image Studio Uploader",
    },
  });
};
