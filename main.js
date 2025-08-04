document.addEventListener('DOMContentLoaded', () => {
    // Деструктуризация зависимостей из window
    const { jsPDF } = window.jspdf;

    // --- 1. КОНСТАНТЫ И НАЧАЛЬНОЕ СОСТОЯНИЕ ---
    const MASTERS = ['Владимир Ч.', 'Владимир А.', 'Максим', 'Андрей', 'Данила', 'Артём'];
    const DIRECTOR_NAME = 'Орлов Владимир';
    const LOCAL_STORAGE_KEY = 'vipauto_service_journal';

    const getInitialState = () => ({
        // Данные текущего дня
        today: {
            orders: MASTERS.reduce((acc, name) => ({ ...acc, [name]: [] }), {}),
            bonuses: MASTERS.reduce((acc, name) => ({ ...acc, [name]: 0 }), {}),
        },
        // История за рабочую неделю
        weekHistory: {
            // "2024-05-20": { ...today state }
        },
        // Дата последнего сохранения, для сброса недели
        lastSavedDate: new Date().toISOString().split('T')[0],
    });

    // --- 2. УПРАВЛЕНИЕ СОСТОЯНИЕМ (STATE) ---
    let state = loadState();

    function saveState() {
        state.lastSavedDate = new Date().toISOString().split('T')[0];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    }

    function loadState() {
        const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            // Проверка и сброс недели в понедельник
            const today = new Date();
            const lastSaved = new Date(parsedState.lastSavedDate);
            const isMonday = today.getDay() === 1;
            // Если сегодня понедельник, а последняя запись была не в это воскресенье или понедельник
            if (isMonday && today.toDateString() !== lastSaved.toDateString()) {
                const diffDays = (today.getTime() - lastSaved.getTime()) / (1000 * 3600 * 24);
                if (diffDays > 2) { // Если прошло больше 2 дней (сб, вс)
                    parsedState.weekHistory = {}; // Сбросить историю
                }
            }
            return parsedState;
        }
        return getInitialState();
    }

    function resetAllData() {
        if (confirm('Вы уверены, что хотите удалить ВСЕ данные? Это действие необратимо.')) {
            state = getInitialState();
            saveState();
            renderApp();
        }
    }
    
    // --- 3. ЛОГИКА РАСЧЁТОВ (ЧИСТЫЕ ФУНКЦИИ) ---
    const formatCurrency = (num) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 }).format(num);

    function calculateShares(total, bonusPercent) {
        const baseShare = total / 2;
        const bonusAmount = baseShare * (bonusPercent / 100);
        const masterShare = baseShare + bonusAmount;
        const directorShare = baseShare - bonusAmount;
        return { masterShare, directorShare };
    }

    function getDayTotals(dayData) {
        const totals = {
            masters: {},
            service: {
                total: 0,
                directorTotal: 0,
                masterTotal: 0,
                cash: 0,
                card: 0,
            }
        };

        MASTERS.forEach(name => {
            const masterOrders = dayData.orders[name] || [];
            const totalAmount = masterOrders.reduce((sum, order) => sum + order.amount, 0);
            const bonusPercent = dayData.bonuses[name] || 0;
            const { masterShare, directorShare } = calculateShares(totalAmount, bonusPercent);
            
            const cash = masterOrders.filter(o => o.payment === 'cash').reduce((s, o) => s + o.amount, 0);
            const card = masterOrders.filter(o => o.payment === 'card').reduce((s, o) => s + o.amount, 0);

            totals.masters[name] = {
                totalAmount,
                masterShare,
                directorShare,
                bonusPercent,
                cash,
                card,
                orderCount: masterOrders.length
            };

            totals.service.total += totalAmount;
            totals.service.directorTotal += directorShare;
            totals.service.masterTotal += masterShare;
            totals.service.cash += cash;
            totals.service.card += card;
        });

        return totals;
    }

    // --- 4. РЕНДЕРИНГ (ОТРИСОВКА ИНТЕРФЕЙСА) ---
    function renderApp() {
        // Сохранение данных текущего дня в историю, если день сменился
        const todayStr = new Date().toISOString().split('T')[0];
        const dayOfWeek = new Date().getDay(); // 0-Вс, 1-Пн, ..., 6-Сб
        
        // Сохраняем в историю если дата изменилась и это был рабочий день (ПН-ПТ)
        if (state.lastSavedDate !== todayStr && new Date(state.lastSavedDate).getDay() >= 1 && new Date(state.lastSavedDate).getDay() <= 5) {
            state.weekHistory[state.lastSavedDate] = JSON.parse(JSON.stringify(state.today));
            state.today = getInitialState().today;
        }

        document.getElementById('current-date').textContent = `Данные на: ${new Date().toLocaleDateString('ru-RU')}`;
        renderMasterCards();
        renderSummaryTable();
        renderWeekHistory();
        saveState();
    }

    function renderMasterCards() {
        const grid = document.getElementById('masters-grid');
        grid.innerHTML = MASTERS.map(name => {
            const totals = getDayTotals(state.today).masters[name];
            return `
                <div class="master-card">
                    <h4>${name}</h4>
                    <form class="add-order-form" data-master="${name}">
                        <input type="number" name="amount" placeholder="Сумма, ₽" required min="1">
                        <select name="payment" required>
                            <option value="" disabled selected>Оплата</option>
                            <option value="cash">Наличные</option>
                            <option value="card">Карта</option>
                        </select>
                        <input type="text" name="car" placeholder="Марка авто (опционально)" class="full-width">
                        <button type="submit" class="btn btn-primary full-width">Добавить заказ</button>
                    </form>
                    
                    <ul class="orders-list">
                        ${state.today.orders[name].map((order, index) => `
                            <li class="order-item">
                                <span class="order-item-details">
                                    ${formatCurrency(order.amount)} (${order.payment === 'cash' ? 'нал.' : 'карта'})
                                    ${order.car ? `<br><small>${order.car}</small>` : ''}
                                </span>
                                <button class="btn-icon" data-action="delete-order" data-master="${name}" data-index="${index}" aria-label="Удалить заказ">&times;</button>
                            </li>
                        `).join('')}
                    </ul>

                    <div class="bonus-control">
                        <label>
                            <span>Премия:</span>
                            <span id="bonus-value-${name.replace(/\s/g, '_')}">${state.today.bonuses[name]}%</span>
                        </label>
                        <input type="range" min="0" max="20" step="2" value="${state.today.bonuses[name]}" data-action="set-bonus" data-master="${name}">
                    </div>

                    <div class="master-totals">
                        <p><span>Всего заказов:</span> <span>${formatCurrency(totals.totalAmount)}</span></p>
                        <p><span>Доля Директора:</span> <span>${formatCurrency(totals.directorShare)}</span></p>
                        <p class="total-master-salary"><span>Итог Мастеру:</span> <span>${formatCurrency(totals.masterShare)}</span></p>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderSummaryTable() {
        const container = document.getElementById('summary-table-container');
        const totals = getDayTotals(state.today);
        
        let tableHTML = `
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>Имя</th>
                        <th>Общая выручка</th>
                        <th>Доля Директора</th>
                        <th>З/П Мастера</th>
                        <th>Наличные</th>
                        <th>Карта</th>
                    </tr>
                </thead>
                <tbody>
        `;
        MASTERS.forEach(name => {
            const masterTotals = totals.masters[name];
            if (masterTotals.orderCount > 0) {
                tableHTML += `
                    <tr>
                        <td>${name}</td>
                        <td>${formatCurrency(masterTotals.totalAmount)}</td>
                        <td>${formatCurrency(masterTotals.directorShare)}</td>
                        <td><strong>${formatCurrency(masterTotals.masterShare)}</strong></td>
                        <td>${formatCurrency(masterTotals.cash)}</td>
                        <td>${formatCurrency(masterTotals.card)}</td>
                    </tr>
                `;
            }
        });

        tableHTML += `
                <tr class="total-row">
                    <td>ИТОГО ПО СЕРВИСУ</td>
                    <td>${formatCurrency(totals.service.total)}</td>
                    <td>${formatCurrency(totals.service.directorTotal)}</td>
                    <td>${formatCurrency(totals.service.masterTotal)}</td>
                    <td>${formatCurrency(totals.service.cash)}</td>
                    <td>${formatCurrency(totals.service.card)}</td>
                </tr>
            </tbody></table>
        `;
        container.innerHTML = tableHTML;
    }

    function renderWeekHistory() {
        const container = document.getElementById('history-container');
        const sortedDates = Object.keys(state.weekHistory).sort().reverse();
        
        if (sortedDates.length === 0) {
            container.innerHTML = '';
            document.getElementById('history-export-buttons').style.display = 'none';
            return;
        }

        document.getElementById('history-export-buttons').style.display = 'flex';
        container.innerHTML = sortedDates.map(date => {
            const dayData = state.weekHistory[date];
            const totals = getDayTotals(dayData);
            const formattedDate = new Date(date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
            
            return `
                <div class="history-day-block">
                    <h4>${formattedDate}</h4>
                    <table class="history-table">
                        <thead>
                            <tr><th>Имя</th><th>Выручка</th><th>Доля Директора</th><th>З/П Мастера</th></tr>
                        </thead>
                        <tbody>
                            ${MASTERS.map(name => {
                                const masterTotals = totals.masters[name];
                                return masterTotals.totalAmount > 0 ? `
                                    <tr>
                                        <td>${name}</td>
                                        <td>${formatCurrency(masterTotals.totalAmount)}</td>
                                        <td>${formatCurrency(masterTotals.directorShare)}</td>
                                        <td><strong>${formatCurrency(masterTotals.masterShare)}</strong></td>
                                    </tr>` : '';
                            }).join('')}
                            <tr class="total-row">
                                <td>ИТОГО</td>
                                <td>${formatCurrency(totals.service.total)}</td>
                                <td>${formatCurrency(totals.service.directorTotal)}</td>
                                <td>${formatCurrency(totals.service.masterTotal)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
    }

    // --- 5. ОБРАБОТЧИКИ СОБЫТИЙ ---
    document.getElementById('masters-grid').addEventListener('submit', (e) => {
        if (e.target.classList.contains('add-order-form')) {
            e.preventDefault();
            const form = e.target;
            const masterName = form.dataset.master;
            const amount = parseFloat(form.elements.amount.value);
            const payment = form.elements.payment.value;
            const car = form.elements.car.value.trim();
            
            if (amount > 0 && payment) {
                state.today.orders[masterName].push({ amount, payment, car, id: Date.now() });
                form.reset();
                renderApp();
            }
        }
    });

    document.getElementById('masters-grid').addEventListener('click', (e) => {
        const target = e.target;
        if (target.dataset.action === 'delete-order') {
            const masterName = target.dataset.master;
            const index = parseInt(target.dataset.index, 10);
            state.today.orders[masterName].splice(index, 1);
            renderApp();
        }
    });

    document.getElementById('masters-grid').addEventListener('input', (e) => {
        const target = e.target;
        if (target.dataset.action === 'set-bonus') {
            const masterName = target.dataset.master;
            const bonusValue = parseInt(target.value, 10);
            state.today.bonuses[masterName] = bonusValue;
            document.getElementById(`bonus-value-${masterName.replace(/\s/g, '_')}`).textContent = `${bonusValue}%`;
            // Перерисовываем только сводку для производительности
            renderSummaryTable();
            // И обновляем итоги в карточке мастера
            const totals = getDayTotals(state.today).masters[masterName];
            const card = target.closest('.master-card');
            card.querySelector('.master-totals p:nth-child(2) span:last-child').textContent = formatCurrency(totals.directorShare);
            card.querySelector('.total-master-salary span:last-child').textContent = formatCurrency(totals.masterShare);
            saveState(); // Сохраняем при изменении ползунка
        }
    });

    // Модальное окно
    const helpModal = document.getElementById('help-modal');
    document.getElementById('help-btn').addEventListener('click', () => helpModal.showModal());
    document.getElementById('close-modal-btn').addEventListener('click', () => helpModal.close());

    // Сброс данных
    document.getElementById('reset-all-btn').addEventListener('click', resetAllData);
    
    // Экспорт
    document.getElementById('export-day-csv').addEventListener('click', () => exportDayToCSV());
    document.getElementById('export-day-pdf').addEventListener('click', () => exportDayToPDF());
    document.getElementById('export-week-csv').addEventListener('click', () => exportWeekToCSV());
    document.getElementById('export-week-pdf').addEventListener('click', () => exportWeekToPDF());

    // --- 6. ЛОГИКА ЭКСПОРТА ---
    function generateCsv(headers, data, fileName) {
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // \uFEFF for BOM
        csvContent += headers.join(';') + '\r\n';
        data.forEach(row => {
            csvContent += row.join(';') + '\r\n';
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    function generatePdf(title, head, body, fileName) {
        const doc = new jsPDF();
        // Добавление поддержки кириллицы
        doc.addFont('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.9/fonts/Roboto/Roboto-Regular.ttf', 'Roboto', 'normal');
        doc.setFont('Roboto');

        doc.text(title, 14, 20);
        doc.autoTable({
            startY: 25,
            head: [head],
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [33, 37, 41] },
            styles: { font: 'Roboto', fontStyle: 'normal' },
        });
        doc.save(fileName);
    }

    function exportDayToCSV() {
        const totals = getDayTotals(state.today);
        const headers = ['Имя', 'Общая выручка', 'Премия, %', 'Доля Директора', 'З/П Мастера', 'Наличные', 'Карта'];
        const dataRows = MASTERS.map(name => {
            const d = totals.masters[name];
            return [name, d.totalAmount, d.bonusPercent, d.directorShare, d.masterShare, d.cash, d.card];
        });
        dataRows.push(['ИТОГО', totals.service.total, '', totals.service.directorTotal, totals.service.masterTotal, totals.service.cash, totals.service.card]);
        generateCsv(headers, dataRows, `Отчет_VIPавто_день_${state.lastSavedDate}.csv`);
    }

    function exportDayToPDF() {
        const totals = getDayTotals(state.today);
        const title = `Отчет за день: ${new Date().toLocaleDateString('ru-RU')}`;
        const head = ['Имя', 'Выручка', 'З/П Мастера', 'Наличные', 'Карта'];
        const body = MASTERS.filter(name => totals.masters[name].totalAmount > 0).map(name => {
            const d = totals.masters[name];
            return [name, formatCurrency(d.totalAmount), formatCurrency(d.masterShare), formatCurrency(d.cash), formatCurrency(d.card)];
        });
        body.push(['ИТОГО', formatCurrency(totals.service.total), formatCurrency(totals.service.masterTotal), formatCurrency(totals.service.cash), formatCurrency(totals.service.card)]);
        generatePdf(title, head, body, `Отчет_VIPавто_день_${state.lastSavedDate}.pdf`);
    }

    function exportWeekToCSV() {
        const headers = ['Дата', 'Имя', 'Общая выручка', 'Премия, %', 'Доля Директора', 'З/П Мастера'];
        const dataRows = [];
        Object.keys(state.weekHistory).sort().forEach(date => {
            const dayData = state.weekHistory[date];
            const totals = getDayTotals(dayData);
            MASTERS.forEach(name => {
                const d = totals.masters[name];
                if(d.totalAmount > 0) {
                    dataRows.push([date, name, d.totalAmount, d.bonusPercent, d.directorShare, d.masterShare]);
                }
            });
            dataRows.push([date, 'ИТОГО ЗА ДЕНЬ', totals.service.total, '', totals.service.directorTotal, totals.service.masterTotal]);
        });
        generateCsv(headers, dataRows, `Отчет_VIPавто_неделя.csv`);
    }
    
    function exportWeekToPDF() {
        const title = `Отчет за неделю`;
        const head = ['Дата', 'Имя', 'Выручка', 'З/П Мастера'];
        const body = [];
        Object.keys(state.weekHistory).sort().forEach(date => {
            const dayData = state.weekHistory[date];
            const totals = getDayTotals(dayData);
            body.push([{ content: new Date(date).toLocaleDateString('ru-RU'), colSpan: 4, styles: { fontStyle: 'bold', fillColor: '#f0f0f0' } }]);
            MASTERS.forEach(name => {
                 const d = totals.masters[name];
                if(d.totalAmount > 0) {
                   body.push([ '', name, formatCurrency(d.totalAmount), formatCurrency(d.masterShare) ]);
                }
            });
             body.push([ '', 'ИТОГО', formatCurrency(totals.service.total), formatCurrency(totals.service.masterTotal) ]);
        });

        generatePdf(title, head, body, `Отчет_VIPавто_неделя.pdf`);
    }


    // --- 7. ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ---
    renderApp();
});
