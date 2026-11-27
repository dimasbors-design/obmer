#!/bin/bash
# Установка посредника тревог на ноутбук с Linux Mint (одной командой):
#   curl -fsSL https://raw.githubusercontent.com/dimasbors-design/obmer/main/tools/alert-relay/install.sh | sudo bash
# Что делает:
#   1) кладёт relay.py в /opt/alert-relay;
#   2) запускает его как службу, которая сама стартует при включении ноутбука;
#   3) разрешает порт 8088 в брандмауэре (если он включён);
#   4) чтобы ноутбук не засыпал при закрытой крышке и не уходил в сон сам.
# Удалить: sudo systemctl disable --now alert-relay; sudo rm -rf /opt/alert-relay /etc/systemd/system/alert-relay.service
set -e
if [ "$(id -u)" != 0 ]; then echo "Запустите через sudo"; exit 1; fi
PORT=8088
SRC=https://raw.githubusercontent.com/dimasbors-design/obmer/main/tools/alert-relay/relay.py

echo "== 1. Скачиваю программу"
mkdir -p /opt/alert-relay
curl -fsSL "$SRC" -o /opt/alert-relay/relay.py
command -v python3 >/dev/null || apt-get install -y python3

echo "== 2. Служба alert-relay (автозапуск)"
cat > /etc/systemd/system/alert-relay.service <<EOF
[Unit]
Description=Посредник воздушных тревог для часов на iPad
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/alert-relay/relay.py $PORT
Restart=always
RestartSec=5
User=nobody

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable alert-relay >/dev/null 2>&1
systemctl restart alert-relay

echo "== 3. Брандмауэр"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow $PORT/tcp >/dev/null && echo "порт $PORT открыт"
else
  echo "брандмауэр выключен, ничего делать не нужно"
fi

echo "== 4. Не засыпать (крышка и простой)"
mkdir -p /etc/systemd/logind.conf.d
cat > /etc/systemd/logind.conf.d/alert-relay.conf <<EOF
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
EOF
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true
echo "сон отключён (применится после перезагрузки)"

# avahi даёт ноутбуку имя вида имя.local, по которому его найдёт iPad
command -v avahi-daemon >/dev/null || apt-get install -y avahi-daemon >/dev/null 2>&1 || true
systemctl enable --now avahi-daemon >/dev/null 2>&1 || true

sleep 3
NAME=$(hostname).local
IP=$(hostname -I | awk '{print $1}')
echo
if curl -fs "http://localhost:$PORT/s.json" >/dev/null; then
  echo "ГОТОВО, посредник работает: $(curl -fs http://localhost:$PORT/s.json)"
else
  echo "Что-то не так: служба не отвечает. Пришлите вывод: systemctl status alert-relay"
fi
echo
echo "Адрес для iPad:  http://$NAME:$PORT"
echo "Запасной адрес:  http://$IP:$PORT   (если имя не сработает)"
echo "Проверка на iPad: https://dimasbors-design.github.io/obmer/clock/relaytest.html"
