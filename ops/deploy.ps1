param(
    [string]$Server = '176.123.165.39',
    [string]$SshUser = 'user1',
    [string]$KeyPath = (Join-Path $env:USERPROFILE 'Desktop\id_rsa')
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $projectRoot 'app'
$distDir = Join-Path $appDir 'dist'
$remoteScript = Join-Path $PSScriptRoot 'activate-release.sh'
$release = Get-Date -Format 'yyyyMMddTHHmmss'
$archiveName = "doska-$release.tar.gz"
$archivePath = Join-Path $env:TEMP $archiveName
$sshTarget = "${SshUser}@${Server}"
$sshOptions = @('-i', $KeyPath, '-o', 'IdentitiesOnly=yes', '-o', 'ConnectTimeout=15')

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    throw "SSH key not found: $KeyPath"
}
if (-not (Test-Path -LiteralPath $remoteScript -PathType Leaf)) {
    throw "Remote deploy script not found: $remoteScript"
}

try {
    Push-Location $appDir
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath (Join-Path $distDir 'index.html') -PathType Leaf)) {
        throw 'Build did not produce dist/index.html.'
    }

    & tar.exe -czf $archivePath -C $distDir .
    if ($LASTEXITCODE -ne 0) { throw 'Could not pack dist.' }

    & scp.exe @sshOptions $archivePath $remoteScript "${sshTarget}:/tmp/"
    if ($LASTEXITCODE -ne 0) {
        throw 'Upload failed. Check SSH access (and turn off VPN if it blocks SSH), then retry.'
    }

    & ssh.exe @sshOptions -tt $sshTarget "sudo bash /tmp/activate-release.sh /tmp/$archiveName $release"
    if ($LASTEXITCODE -ne 0) { throw 'Server activation failed. The previous site should still be available; check the SSH output.' }

    Write-Host "Deployed local app to https://doska.vtbdev.ru/ (release $release)."
}
finally {
    Remove-Item -LiteralPath $archivePath -ErrorAction SilentlyContinue
}
