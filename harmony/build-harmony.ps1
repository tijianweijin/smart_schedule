param([ValidateSet('debug','release')][string]$Mode='debug', [switch]$Sign, [switch]$FreshBuild)
$ErrorActionPreference='Stop'
$repoPath=Split-Path -Parent $PSScriptRoot
$toolPath=Join-Path $repoPath '.local\harmony-tools'
$cliPath=Join-Path $toolPath 'cli\node_modules\.bin\devecocli.cmd'
$sdkSource=Join-Path $toolPath 'studio'
$locationFile=Join-Path $toolPath 'build-location.json'
if(!(Test-Path -LiteralPath $cliPath) -or !(Test-Path -LiteralPath (Join-Path $sdkSource 'sdk\default\sdk-pkg.json'))){throw '未找到已验证的华为官方工具，请先准备项目本地 SDK。'}
if(Test-Path -LiteralPath $locationFile){
  $buildRoot=(Get-Content -LiteralPath $locationFile -Raw | ConvertFrom-Json).path
  if($buildRoot -notmatch '^C:\\Windows\\Temp\\KetimeHarmony-[a-f0-9]{32}$'){throw '构建缓存路径不安全，未执行任何复制。'}
  $folder=Get-Item -LiteralPath $buildRoot
  if($folder.Attributes -band [IO.FileAttributes]::ReparsePoint){throw '构建目录不能为重解析链接。'}
  $security=Get-Acl -LiteralPath $buildRoot
  $currentSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($rule in $security.Access){$sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($sid -notin @($currentSid,'S-1-5-18')){throw '构建缓存权限不是当前用户私有，已停止。'}}
}else{
  $buildRoot='C:\Windows\Temp\KetimeHarmony-'+[Guid]::NewGuid().ToString('N')
  New-Item -ItemType Directory -Path $buildRoot | Out-Null
  $security=New-Object Security.AccessControl.DirectorySecurity
  $security.SetAccessRuleProtection($true,$false)
  foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
  Set-Acl -LiteralPath $buildRoot -AclObject $security
  @{path=$buildRoot}|ConvertTo-Json|Set-Content -LiteralPath $locationFile -Encoding utf8
}
$studioPath=Join-Path $buildRoot 'studio'
if(!(Test-Path -LiteralPath (Join-Path $studioPath 'sdk\default\sdk-pkg.json'))){
  & robocopy $sdkSource $studioPath /E /XJ /R:0 /W:0 /NFL /NDL /NJH /NJS /NP
  if($LASTEXITCODE -gt 7){throw '官方 SDK 私有构建副本未准备成功。'}
}
$pythonPath=if($env:KETIME_BUILD_PYTHON){$env:KETIME_BUILD_PYTHON}else{'C:\anaconda3\python.exe'}
if(!$FreshBuild){
  & $pythonPath (Join-Path $repoPath 'tools\prepare-harmony.py')
  if($LASTEXITCODE -ne 0){throw '鸿蒙资源生成失败。'}
}
$appPath=Join-Path $buildRoot $(if($FreshBuild){'app-'+[Guid]::NewGuid().ToString('N')}else{'app'})
New-Item -ItemType Directory -Path $appPath -Force | Out-Null
# Copy explicit source directories only: never the repository, .local, APKs,
# backup data, credential vaults, prior HAPs or signing files.
foreach($name in @('AppScope','hvigor')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $appPath -Recurse -Force}
foreach($name in @('build-profile.json5','oh-package.json5','hvigorfile.ts')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $appPath -Force}
$entryPath=Join-Path $appPath 'entry'
New-Item -ItemType Directory -Path $entryPath -Force | Out-Null
foreach($name in @('src','build-profile.json5','oh-package.json5','hvigorfile.ts','obfuscation-rules.txt')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('entry\'+$name)) -Destination $entryPath -Recurse -Force}
if($FreshBuild){
  & $pythonPath (Join-Path $repoPath 'tools\prepare-harmony.py') --output-root $appPath
  if($LASTEXITCODE -ne 0){throw '鸿蒙独立资源生成失败。'}
}
$env:DEVECO_CLI_STUDIO_PATH=$studioPath
Push-Location $appPath
try{
  if($Sign){& $cliPath signature generate;if($LASTEXITCODE -ne 0){throw '签名材料未生成，请本人登录并连接授权设备。'}}
  & $cliPath build --build-mode $Mode
  if($LASTEXITCODE -ne 0){throw '鸿蒙编译失败，请查看上方诊断。'}
  $distPath=Join-Path $PSScriptRoot 'dist'
  New-Item -ItemType Directory -Path $distPath -Force | Out-Null
  $suffix=if($Sign){'signed'}else{'unsigned'}
  $hapPath=Join-Path $appPath ('entry\build\default\outputs\default\entry-default-'+$suffix+'.hap')
  if(!(Test-Path -LiteralPath $hapPath)){throw '未找到对应的 HAP；未将未签名包冒充安装版。'}
  $version=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'AppScope\app.json5') -Raw | ConvertFrom-Json).app.versionName
  $outputPath=Join-Path $distPath ('刻时-HarmonyOS-'+$version+'-'+$Mode+'-'+$suffix+'.hap')
  Copy-Item -LiteralPath $hapPath -Destination $outputPath -Force
  Get-FileHash -LiteralPath $outputPath -Algorithm SHA256
}finally{Pop-Location}
