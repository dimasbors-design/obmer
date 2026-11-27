# Задание для Claude Code: настроить домашний сервер на этом ноутбуке

Ты работаешь прямо на ноутбуке пользователя. Пользователь (Дмитрий) не программист:
говори с ним по-русски, коротко и просто, объясняй, что делаешь и зачем.
Выполняй шаги по порядку, после каждого шага кратко сообщай результат.
Если что-то пошло не так, остановись, объясни и предложи вариант.

## Что это за машина
- HP ProBook 4535s, процессор AMD A4-3305M (2011 г., архитектура K10/Llano), 8 ГБ ОЗУ.
- **Важно:** у процессора нет SSSE3, SSE4.1, SSE4.2 и AVX. Программы, собранные под
  новые процессоры, падают с «Illegal instruction» / «Недопустимая инструкция» (код 132).
  Поэтому после запуска каждой программы проверяй, что она не упала по этой причине.
  Сам Claude Code тут работает только версии 2.1.112 через Node.js (автообновление
  отключено переменной DISABLE_AUTOUPDATER=1, не включай его).
- Системный диск: SSD Kingston 60 ГБ, свежий Linux Mint 22.3 (основа Ubuntu 24.04). Место беречь:
  фильмы и торренты только на внешний диск.
- Внешний диск WD 1 ТБ по USB — для фильмов, торрентов, общей папки.
- Пользователь `maks`, имя компьютера `maks-HP`. Ноутбук подключён к роутеру кабелем.
- Питание от инвертора с аккумуляторами, свет могут отключать: всё должно само
  подниматься после включения.
- sudo без пароля временно разрешён файлом `/etc/sudoers.d/claude-setup` (пользователь
  создал его перед запуском). В конце работы ты его удалишь.

## Жёсткие правила
- **Никогда не форматируй и не переразмечай диски** без прямого «да» от пользователя
  в этом разговоре. Особенно внешний WD: на нём могут быть его файлы.
- Не меняй настройки роутера сам. Если нужно, дай пользователю пошаговую подсказку.
- Не перезагружай ноутбук, не спросив: перезагрузка закроет этот разговор.

## Шаги

### 1. Проверка
- `lscpu | grep -i -E 'model name|flags'`, `free -h`, `lsblk -o NAME,SIZE,ROTA,FSTYPE,LABEL,MOUNTPOINT,MODEL`, `df -h /`,
  `ip -4 addr`, `ip route`, `ping -c2 1.1.1.1`, `sudo -n true && echo sudo ok`.
- Сообщи коротко, что видишь.

### 2. Обновление и базовые пакеты
- `sudo apt update && sudo DEBIAN_FRONTEND=noninteractive apt full-upgrade -y`
- `sudo apt install -y openssh-server avahi-daemon curl htop smartmontools ntfs-3g exfatprogs`
- `sudo smartctl -H /dev/sda` (здоровье SSD) — сообщи результат.

### 3. Не засыпать и сам включаться
- Крышка и простой: создать `/etc/systemd/logind.conf.d/server.conf` с
  `HandleLidSwitch=ignore`, `HandleLidSwitchExternalPower=ignore`, `HandleLidSwitchDocked=ignore`, `IdleAction=ignore`;
  `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`.
- В Cinnamon отключить сон и гашение экрана по таймеру для пользователя
  (gsettings `org.cinnamon.settings-daemon.plugins.power`: sleep-inactive-ac-timeout=0,
  sleep-inactive-battery-timeout=0, lid-close-ac-action='nothing', lid-close-battery-action='nothing').
- Скажи пользователю: в BIOS (F10 при включении) стоит поискать пункт вроде
  «AC Power Recovery / Power On when AC detected» и включить, если есть. Это необязательно.

### 4. Постоянный адрес
- Узнай текущий IP, MAC сетевой карты (кабель) и адрес роутера (шлюз).
- Ничего в сети не меняй. Дай пользователю короткую подсказку: открыть в браузере адрес
  роутера, найти «DHCP / Резервирование адресов / Address Reservation / Static lease»
  и закрепить текущий IP за этим MAC. Плюс ноутбук теперь доступен по имени `maks-HP.local`.

### 5. Внешний диск WD
- Найди его в `lsblk`. Если его нет — попроси пользователя подключить и подожди.
- Посмотри файловую систему и содержимое (`ls` верхнего уровня, `df -h`).
- Если файловая система есть (NTFS/exFAT/ext4) — **не форматируй**, подключай как есть:
  точка `/mnt/media`, запись в `/etc/fstab` по UUID с опцией `nofail,x-systemd.device-timeout=10`
  (для NTFS: `ntfs3` или `ntfs-3g` с `uid=1000,gid=1000`; для exFAT: `uid=1000,gid=1000`).
- Если диск пустой или без файловой системы — спроси пользователя, можно ли
  отформатировать в ext4 (всё на нём сотрётся). Только после «да».
- Создай папки: `/mnt/media/Фильмы`, `/mnt/media/Сериалы`, `/mnt/media/Торренты`, `/mnt/media/Общая`.
- Проверь `sudo mount -a` без ошибок.

### 6. Docker
- `sudo apt install -y docker.io docker-compose-v2` (из репозитория Ubuntu, этого достаточно),
  `sudo systemctl enable --now docker`, `sudo usermod -aG docker maks`.
- `sudo docker run --rm hello-world` — проверка.

### 7. Программы в Docker
Папка `/opt/homeserver`, файл `/opt/homeserver/docker-compose.yml`, все с `restart: unless-stopped`,
часовой пояс `Europe/Kyiv`:
- **Home Assistant**: `ghcr.io/home-assistant/home-assistant:stable`, `network_mode: host`,
  тома `/opt/homeserver/homeassistant:/config`, `/etc/localtime:/etc/localtime:ro`, `/run/dbus:/run/dbus:ro`. Порт 8123.
- **qBittorrent**: `lscr.io/linuxserver/qbittorrent:latest`, PUID=1000, PGID=1000, WEBUI_PORT=8080,
  порты 8080, 6881/tcp, 6881/udp, тома `/opt/homeserver/qbittorrent:/config`, `/mnt/media/Торренты:/downloads`.
- **Jellyfin**: `jellyfin/jellyfin:latest`, порт 8096, тома `/opt/homeserver/jellyfin/config:/config`,
  `/opt/homeserver/jellyfin/cache:/cache`, `/mnt/media:/media:ro`. Перекодирование процессор
  не потянет — это нормально, смотреть будем прямым воспроизведением.
- Запуск: `cd /opt/homeserver && sudo docker compose up -d`.
- **Проверка на старый процессор:** через 1–2 минуты `sudo docker compose ps` и
  `sudo docker compose logs --tail=50 <имя>` для каждого. Если контейнер перезапускается
  или в логах «Illegal instruction» / код выхода 132:
  - для Home Assistant попробуй более старые версии (например, теги `2025.6`, `2025.1`, `2024.6`)
    и найди самую новую, которая работает; запиши, какая подошла;
  - для других — тоже ищи рабочую версию постарше;
  - сообщи пользователю, что нашёл.
- Проверь, что открываются `curl -sI http://localhost:8123`, `:8080`, `:8096`.
- Временный пароль qBittorrent возьми из логов контейнера и скажи пользователю
  (логин admin), посоветуй сменить в настройках веб-интерфейса.

### 8. Общая папка (Samba) — прямо в системе, не в Docker
- `sudo apt install -y samba`
- В `/etc/samba/smb.conf` добавь общий ресурс `[media]`: путь `/mnt/media`, `browseable = yes`,
  `read only = no`, `guest ok = no`, `valid users = maks`, `force user = maks`; в `[global]` — `map to guest = never`.
  Гостевой доступ Windows 10/11 блокирует, поэтому только с паролем: попроси пользователя выполнить
  в своём Терминале `sudo smbpasswd -a maks` и придумать пароль для папки.
- `sudo systemctl restart smbd nmbd`, `testparm -s` без ошибок.
- Адрес для Windows: `\\maks-HP\media` или `\\<IP>\media`.

### 9. Посредник тревог для часов на iPad
- `curl -fsSL https://raw.githubusercontent.com/dimasbors-design/obmer/main/tools/alert-relay/install.sh | sudo bash`
- Должно написать «ГОТОВО». Сообщи адреса, которые он покажет.

### 10. Брандмауэр
- Если `ufw` включён, открой: 22, 8123, 8080, 8096, 6881 (tcp/udp), 8088, Samba (`ufw allow samba`).
  Если выключен — ничего не делай.

### 11. Завершение
- Удали временный доступ: `sudo rm /etc/sudoers.d/claude-setup` и проверь, что `sudo -n true` теперь требует пароль.
- Запиши отчёт в `~/Рабочий стол/Сервер - адреса и пароли.txt` (или `~/Desktop/...`, смотря что есть):
  IP, имя `maks-HP.local`, адреса всех программ, версия Home Assistant, где лежат настройки
  (`/opt/homeserver`), как перезапустить (`cd /opt/homeserver && sudo docker compose restart`).
- Покажи пользователю итог: список адресов вида
  Home Assistant http://IP:8123, qBittorrent http://IP:8080, Jellyfin http://IP:8096,
  общая папка \\maks-HP\media, тревоги http://IP:8088.
- Попроси пользователя сфотографировать итог и отправить его в чат «Домо план».
- Спроси разрешения на перезагрузку для проверки автозапуска. После перезагрузки пользователь
  может снова запустить `claude` и попросить: «проверь, что все контейнеры и службы поднялись».
