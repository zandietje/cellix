@echo off
echo Fixing loopback exemption for Office Add-ins...
echo.
CheckNetIsolation LoopbackExempt -a -n="microsoft.win32webviewhost_cw5n1h2txyewy"
echo.
echo Done! Please restart Excel and try again.
pause
