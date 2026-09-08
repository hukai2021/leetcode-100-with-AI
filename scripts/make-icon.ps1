$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dir = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(256,256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(20,112,91))
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White,18)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLines($pen,[System.Drawing.Point[]]@([System.Drawing.Point]::new(82,82),[System.Drawing.Point]::new(40,128),[System.Drawing.Point]::new(82,174)))
$graphics.DrawLines($pen,[System.Drawing.Point[]]@([System.Drawing.Point]::new(174,82),[System.Drawing.Point]::new(216,128),[System.Drawing.Point]::new(174,174)))
$graphics.DrawLine($pen,146,68,111,188)
$bitmap.Save((Join-Path $dir 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create((Join-Path $dir 'icon.ico'))
try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $pen.Dispose() }
