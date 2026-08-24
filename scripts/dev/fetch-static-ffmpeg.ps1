[CmdletBinding()]
param(
  [string]$Destination = '',
  [string]$Url = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Destination)) {
  $repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
  $Destination = Join-Path $repoRoot 'var\ffmpeg'
}

$destinationPath = [IO.Path]::GetFullPath($Destination)
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('bailian-studio-ffmpeg-' + [Guid]::NewGuid().ToString('N'))

if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
  throw 'tar.exe was not found. Use the Windows 10/11 tar command or run fetch-static-ffmpeg.sh in WSL.'
}
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
  throw 'curl.exe was not found. Use the Windows 10/11 curl command or run fetch-static-ffmpeg.sh in WSL.'
}

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
  $archivePath = Join-Path $tempRoot 'ffmpeg.tar.xz'
  Write-Host "Downloading static Linux ffmpeg: $Url"
  & curl.exe --fail --location --retry 3 --retry-all-errors --connect-timeout 15 --max-time 300 --output $archivePath $Url
  if ($LASTEXITCODE -ne 0) {
    throw "curl download failed with exit code $LASTEXITCODE"
  }

  & tar.exe -xJf $archivePath -C $tempRoot
  if ($LASTEXITCODE -ne 0) {
    throw "tar extraction failed with exit code $LASTEXITCODE"
  }

  $releaseDirectory = Get-ChildItem -Path $tempRoot -Directory -Recurse |
    Where-Object {
      (Test-Path (Join-Path $_.FullName 'ffmpeg')) -and
      (Test-Path (Join-Path $_.FullName 'ffprobe'))
    } |
    Select-Object -First 1

  if ($null -eq $releaseDirectory) {
    throw 'The archive did not contain a static release directory with both ffmpeg and ffprobe.'
  }

  New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null
  Copy-Item (Join-Path $releaseDirectory.FullName 'ffmpeg') (Join-Path $destinationPath 'ffmpeg') -Force
  Copy-Item (Join-Path $releaseDirectory.FullName 'ffprobe') (Join-Path $destinationPath 'ffprobe') -Force

  Write-Host "Prepared Linux ffmpeg/ffprobe: $destinationPath"
  Write-Host 'Next: pnpm run deploy:rehearsal:up'
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
