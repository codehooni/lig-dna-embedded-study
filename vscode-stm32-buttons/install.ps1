# Packages this folder into a .vsix (no Node/vsce needed) and installs it into VS Code.
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$pkg = Get-Content "$src\package.json" -Raw | ConvertFrom-Json
$vsix = Join-Path $src "$($pkg.name)-$($pkg.version).vsix"

$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="$($pkg.name)" Version="$($pkg.version)" Publisher="$($pkg.publisher)"/>
    <DisplayName>STM32 Build &amp; Flash Buttons</DisplayName>
    <Description xml:space="preserve">Status bar Build / Flash buttons</Description>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="$($pkg.engines.vscode)"/></Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>
"@
$types = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $vsix) { Remove-Item $vsix }
$zip = [IO.Compression.ZipFile]::Open($vsix, 'Create')
function Add-Text($name, $text) {
  $e = $zip.CreateEntry($name); $w = New-Object IO.StreamWriter($e.Open()); $w.Write($text); $w.Dispose()
}
Add-Text '[Content_Types].xml' $types
Add-Text 'extension.vsixmanifest' $manifest
foreach ($f in 'package.json', 'extension.js') {
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$src\$f", "extension/$f") | Out-Null
}
$zip.Dispose()

& code --install-extension $vsix --force
# 이 워크스페이스는 "STM32 Profile" 프로필을 쓰므로 거기에도 설치
& code --install-extension $vsix --force --profile "STM32 Profile"
