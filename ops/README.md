# Обновление сайта

Откройте PowerShell на своём компьютере и запустите:

```powershell
& "C:\Users\crump\Desktop\W\doska\surf\ops\deploy.ps1"
```

Перед запуском остановите локальный сервер разработки (`Ctrl+C` в его окне PowerShell). Скрипт берёт текущий локальный код из `app`, переустанавливает зависимости, собирает сайт и загружает сборку на `user1@176.123.165.39`. Коммит и `git push` не требуются. По умолчанию используется SSH-ключ `%USERPROFILE%\Desktop\id_rsa`. Скрипт находит `scp.exe` и `ssh.exe` в Windows OpenSSH или Git for Windows, даже если они отсутствуют в `PATH`.

Если PowerShell запрещает запуск `.ps1`, выполните:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\crump\Desktop\W\doska\surf\ops\deploy.ps1"
```

Если SSH зависает на обмене баннером, отключите VPN и повторите запуск. Скрипт переключает существующий сайт через ссылку `/var/www/doska/current`; если такой ссылки нет, он остановится без переключения сайта.
