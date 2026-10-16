param(
  [ValidateSet('Start','Stop','Status')][string]$Action='Start',
  [string]$Name='KetimePhone7',
  [switch]$Headless
)
$ErrorActionPreference='Stop'
if($Name -notmatch '^KetimePhone[57]$'){throw 'Only the dedicated Ketime test instances are allowed.'}
$repoPath=Split-Path -Parent $PSScriptRoot
$locationFile=Join-Path $repoPath '.local\harmony-tools\build-location.json'
if(!(Test-Path -LiteralPath $locationFile)){throw 'The private Harmony tool cache has not been prepared.'}
$buildRoot=(Get-Content -LiteralPath $locationFile -Raw | ConvertFrom-Json).path
if($buildRoot -notmatch '^C:\\Windows\\Temp\\KetimeHarmony-[a-f0-9]{32}$'){throw 'Unexpected tool cache path.'}
$folder=Get-Item -LiteralPath $buildRoot
if($folder.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Tool cache must not be a directory link.'}
$studioPath=Join-Path $buildRoot 'studio'
$emulatorPath=Join-Path $studioPath 'tools\emulator\Emulator.exe'
$instancePath=Join-Path $buildRoot 'emulators'
$imagePath=Join-Path $buildRoot 'images'
if(!(Test-Path -LiteralPath $emulatorPath)){throw 'The official emulator tool is missing.'}
# Emulator 26 requires the effective SDK (sdk/default), unlike the CLI build
# wrapper. Changes here affect only this process, not Windows environment.
$env:DEVECO_SDK_HOME=Join-Path $studioPath 'sdk\default'
Push-Location (Split-Path -Parent $emulatorPath)
try{
  if($Action -eq 'Status'){
    & $emulatorPath -list -details -instancePath $instancePath
  }elseif($Action -eq 'Stop'){
    & $emulatorPath -stop $Name
  }else{
    $configPath=Join-Path $instancePath ($Name+'\config.ini')
    if(!(Test-Path -LiteralPath $configPath)){throw 'This Ketime emulator instance has not been created.'}
    $arguments=@('-start',$Name,'-instancePath',$instancePath,'-imageRoot',$imagePath,'-hdcport','11111','-bootMode','coldboot')
    if($Headless){$arguments+='-noWindow'}
    & $emulatorPath @arguments
  }
  if($LASTEXITCODE -ne 0){throw ('Official emulator exited with code '+$LASTEXITCODE)}
}finally{Pop-Location}
