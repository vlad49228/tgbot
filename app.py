import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
import json
import os
import base64
import time
from threading import Thread

import requests
from flask import Flask, jsonify, request, send_from_directory

BOT_TOKEN     = '8232012309:AAFjb9tAWlwOG711gf-Gl2jjdKWiDT40ZMs'
ADMIN_CHAT_ID = 8201066917
PORT          = int(os.getenv('PORT', '8000'))

# ── Домен сервера (без слеша на конце) ──
# Задаётся через переменную окружения DOMAIN, либо впиши напрямую:
# Например: 'https://yourdomain.com' или 'https://1.2.3.4'
# URL контейнера на Aurorix (e2.aurorix.net:ПОРТ виден в панели управления)
WEB_APP_URL = os.getenv('DOMAIN', 'https://e2.aurorix.net:25965')

BASE_DIR          = os.path.dirname(os.path.abspath(__file__))
BALANCE_FILE      = os.path.join(BASE_DIR, 'user_balances.json')
SUPPORTED_CRYPTOS = ['USDT', 'BTC', 'ETH', 'TON']

# ── GitHub ──
GITHUB_TOKEN  = os.getenv('GITHUB_TOKEN', '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')
GITHUB_REPO   = os.getenv('GITHUB_REPO',  'vlad49228/tgbot')
GITHUB_BRANCH = os.getenv('GITHUB_BRANCH', 'main')
GITHUB_PATH   = os.getenv('GITHUB_PATH',  'user_balances.json')

bot = telebot.TeleBot(BOT_TOKEN)

# ──────────────── GitHub Sync ────────────────

def pull_balances_from_github():
    """Скачиваем user_balances.json с GitHub и сохраняем локально."""
    url = f'https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_PATH}'
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
    }
    try:
        r = requests.get(url, headers=headers, params={'ref': GITHUB_BRANCH}, timeout=10)
        if r.status_code == 200:
            content  = base64.b64decode(r.json().get('content', '')).decode('utf-8')
            balances = json.loads(content)
            with open(BALANCE_FILE, 'w', encoding='utf-8') as f:
                json.dump(balances, f, indent=2, ensure_ascii=False)
            print(f"[GitHub] ✓ Балансы загружены ({len(balances)} пользователей)")
        else:
            print(f"[GitHub] ✗ Pull failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"[GitHub] pull error: {e}")


def _get_file_sha() -> str | None:
    url     = f'https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_PATH}'
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
    }
    try:
        r = requests.get(url, headers=headers, params={'ref': GITHUB_BRANCH}, timeout=10)
        if r.status_code == 200:
            return r.json().get('sha')
    except Exception as e:
        print(f"github get_sha error: {e}")
    return None


def push_balances_to_github(balances: dict):
    """Пушим user_balances.json в GitHub через REST API."""
    url     = f'https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_PATH}'
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
    }
    content_b64 = base64.b64encode(
        json.dumps(balances, indent=2, ensure_ascii=False).encode('utf-8')
    ).decode('utf-8')

    payload = {
        'message': f'update balances ({len(balances)} users)',
        'content': content_b64,
        'branch':  GITHUB_BRANCH,
    }
    sha = _get_file_sha()
    if sha:
        payload['sha'] = sha

    try:
        r = requests.put(url, headers=headers, json=payload, timeout=10)
        if r.status_code in (200, 201):
            print(f"[GitHub] ✓ Обновлён ({len(balances)} пользователей)")
        else:
            print(f"[GitHub] ✗ Push failed {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"[GitHub] push error: {e}")


def push_to_github_async(balances: dict):
    Thread(target=push_balances_to_github, args=(balances,), daemon=True).start()

# ──────────────── Балансы ────────────────

def load_balances():
    try:
        if os.path.exists(BALANCE_FILE):
            with open(BALANCE_FILE, 'rb') as f:
                data = f.read().decode('utf-8').strip()
                if data:
                    return json.loads(data)
    except Exception as e:
        print(f"load_balances error: {e}")
    return {}


def save_balances(balances):
    try:
        with open(BALANCE_FILE, 'wb') as f:
            f.write(json.dumps(balances, indent=2, ensure_ascii=False).encode('utf-8'))
        print(f"Сохранено пользователей: {len(balances)}")
        push_to_github_async(balances)
    except Exception as e:
        print(f"save_balances error: {e}")


def get_user_balances(user_id):
    all_balances = load_balances()
    uid = str(user_id)
    if uid not in all_balances:
        all_balances[uid] = {c: 0.0 for c in SUPPORTED_CRYPTOS}
        save_balances(all_balances)
        print(f"Новый пользователь: {uid}")
    return all_balances[uid]


def set_user_balance(user_id, crypto, amount):
    all_balances = load_balances()
    uid = str(user_id)
    if uid not in all_balances:
        all_balances[uid] = {c: 0.0 for c in SUPPORTED_CRYPTOS}
    all_balances[uid][crypto] = amount
    save_balances(all_balances)

# ──────────────── Flask ────────────────

app = Flask(__name__)

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(BASE_DIR, filename)

@app.route('/api/prices', methods=['GET'])
def api_get_prices():
    try:
        pairs  = {'BTC': 'BTCUSDT', 'ETH': 'ETHUSDT', 'TON': 'TONUSDT'}
        result = {'USDT': {'usd': 1.0, 'change': 0.0}}
        for sym, pair in pairs.items():
            r    = requests.get(f'https://api.binance.com/api/v3/ticker/24hr?symbol={pair}', timeout=8)
            item = r.json()
            if isinstance(item, list):
                item = item[0]
            result[sym] = {
                'usd':    round(float(item['lastPrice']), 6),
                'change': round(float(item['priceChangePercent']), 2),
            }
        resp = jsonify(result)
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    except Exception as e:
        print(f"prices error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/chart', methods=['GET'])
def api_get_chart():
    symbol   = request.args.get('symbol', 'BTC') + 'USDT'
    interval = request.args.get('interval', '1h')
    limit    = request.args.get('limit', '24')
    try:
        r    = requests.get(
            f'https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}',
            timeout=8
        )
        pts  = [[k[0], float(k[4])] for k in r.json()]
        resp = jsonify(pts)
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    except Exception as e:
        print(f"chart error: {e}")
        return jsonify([]), 500


@app.route('/api/balances', methods=['GET'])
def api_get_balances():
    user_id = request.args.get('user_id')
    if not user_id:
        resp = jsonify({'error': 'user_id is required'})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp, 400
    resp = jsonify(get_user_balances(user_id))
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp

# ──────────────── Бот ────────────────

@bot.message_handler(commands=['start'])
def cmd_start(message):
    user_id    = message.chat.id
    username   = message.from_user.username or "нет юзернейма"
    first_name = message.from_user.first_name or ""
    balances   = get_user_balances(user_id)

    bot.send_message(
        ADMIN_CHAT_ID,
        f"Новый пользователь запустил бота!\n"
        f"ID: {user_id}\nUsername: @{username}\nИмя: {first_name}\n\n"
        f"Балансы:\nUSDT: {balances['USDT']}\nBTC: {balances['BTC']}\n"
        f"ETH: {balances['ETH']}\nTON: {balances['TON']}"
    )

    markup = InlineKeyboardMarkup()
    markup.add(InlineKeyboardButton(
        text="Открыть Alpha Crypt",
        web_app=WebAppInfo(url=WEB_APP_URL)
    ))

    bot.send_message(
        user_id,
        "Добро пожаловать в Alpha Crypt.\n\n"
        "Alpha Crypt — это открытая криптобиржа, созданная для тех, кто ценит прозрачность и свободу. "
        "Весь код проекта находится в открытом доступе — любой желающий может проверить, как именно работает платформа, "
        "как хранятся данные и как исполняются сделки. Никаких скрытых механизмов и закрытых алгоритмов.\n\n"
        "На платформе доступна торговля основными активами: Bitcoin, Ethereum, TON и Tether. "
        "Вы можете пополнять счёт, выводить средства и обменивать активы между собой — всё это прямо внутри Telegram, "
        "без необходимости переходить на сторонние сайты или устанавливать дополнительные приложения.\n\n"
        "Alpha Crypt не требует верификации личности. Для начала работы достаточно просто открыть кошелёк. "
        "Ваши средства остаются под вашим контролем на всех этапах.\n\n"
        "Нажмите кнопку ниже, чтобы войти в личный кабинет.",
        reply_markup=markup,
        parse_mode='Markdown'
    )


@bot.message_handler(content_types=['web_app_data'])
def handle_web_app_data(message):
    try:
        data    = json.loads(message.web_app_data.data)
        action  = data.get('action')
        user_id = message.chat.id

        if action == 'get_balances':
            balances = get_user_balances(user_id)
            bot.send_message(user_id, f"BALANCES_DATA:{json.dumps(balances)}")
        elif action == 'select_crypto':
            print(f"Пользователь {user_id} выбрал {data.get('crypto')}")
        elif action == 'withdraw':
            bot.send_message(ADMIN_CHAT_ID, f"Запрос на вывод от {user_id}\nАдрес: {data.get('address')}")
        elif action.startswith('nav_'):
            print(f"Навигация: {action.replace('nav_', '')}")
    except Exception as e:
        print(f"Ошибка в web_app_data: {e}")

# ──────────────── Запуск ────────────────

if __name__ == '__main__':
    print("Запуск Alpha Crypt...")
    print(f"Web App URL: {WEB_APP_URL}")

    # Загружаем актуальные балансы с GitHub
    pull_balances_from_github()

    if not os.path.exists(BALANCE_FILE):
        save_balances({})
        print(f"Создан файл балансов: {BALANCE_FILE}")
    else:
        b = load_balances()
        print(f"Балансы загружены: {len(b)} пользователей")

    # Flask слушает только localhost — nginx проксирует снаружи
    # Aurorix требует 0.0.0.0 — платформа сама терминирует SSL снаружи
    Thread(target=lambda: app.run(host='0.0.0.0', port=PORT, use_reloader=False), daemon=True).start()
    time.sleep(1)

    bot.remove_webhook()
    print("Бот запущен.")
    bot.infinity_polling()
