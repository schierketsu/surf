# Обновление сайта

Откройте PowerShell на своём компьютере и запустите:

```powershell
& "C:\Users\Михаил\Desktop\work\surf\surf\ops\deploy.ps1"
```

Перед запуском остановите локальный сервер разработки (`Ctrl+C` в его окне PowerShell). Скрипт берёт текущий локальный код из `app`, переустанавливает зависимости, собирает сайт и загружает сборку на `user1@176.123.165.39`. Коммит и `git push` не требуются. По умолчанию используется SSH-ключ `C:\Users\Михаил\Desktop\id_rsa`.

Если PowerShell запрещает запуск `.ps1`, выполните:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Михаил\Desktop\work\surf\surf\ops\deploy.ps1"
```

Если SSH зависает на обмене баннером, отключите VPN и повторите запуск. Скрипт переключает существующий сайт через ссылку `/var/www/doska/current`; если такой ссылки нет, он остановится без переключения сайта.
