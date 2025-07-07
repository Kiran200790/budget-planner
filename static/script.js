document.addEventListener('DOMContentLoaded', function () {

    // --- GLOBAL DATA ---
    const flaskDataScript = document.getElementById('flask-data');
    let flaskData = {};
    if (flaskDataScript) {
        try {
            flaskData = JSON.parse(flaskDataScript.getAttribute('data-json'));
        } catch (e) {
            console.error("Error parsing Flask data:", e);
            flaskData = {};
        }
    }
    let expenses = flaskData.expenses || [];

    // --- PANE/TAB SWITCHING LOGIC ---
    function switchPane(targetId, view) {
        console.log(`Switching to pane: ${targetId} in view: ${view}`);
        const viewSelector = view === 'mobile' ? '#mobile-view' : '#desktop-view';

        // Deactivate all panes within the current view
        document.querySelectorAll(`${viewSelector} .main-pane`).forEach(pane => {
            pane.classList.remove('active');
        });

        // Activate the target pane within the current view
        const targetPane = document.querySelector(`${viewSelector} ${targetId}`);
        if (targetPane) {
            targetPane.classList.add('active');
        } else {
            console.error(`Target pane ${targetId} not found in ${viewSelector}.`);
        }

        // Update active state for tabs/nav items within the current view
        const navSelector = view === 'mobile' ? '.nav-item' : '.tab-button';
        document.querySelectorAll(`${viewSelector} ${navSelector}`).forEach(button => {
            button.classList.toggle('active', button.dataset.target === targetId);
        });
    }


    // --- DASHBOARD RENDERING FUNCTIONS ---

    function renderDashboardForView(view) {
        console.log(`Rendering dashboard for ${view}`);
        const selector = view === 'mobile' ? '#mobile-view' : '#desktop-view';
        const container = document.querySelector(selector);
        if (!container) {
            console.error(`${selector} container not found`);
            return;
        }

        // Summary Totals
        const data = flaskData;
        const totalIncomeEl = container.querySelector('.totalIncome');
        if(totalIncomeEl) totalIncomeEl.textContent = (data.total_income || 0).toFixed(2);
        
        const totalExpensesEl = container.querySelector('.totalExpenses');
        if(totalExpensesEl) totalExpensesEl.textContent = (data.total_expenses || 0).toFixed(2);


        const totalEMIEl = container.querySelector('.totalEMI');
        if(totalEMIEl) totalEMIEl.textContent = (data.total_emi || 0).toFixed(2);

        // Mobile summary EMI
        const totalEMIMobileEl = container.querySelector('.totalEMIMobile');
        if(totalEMIMobileEl) totalEMIMobileEl.textContent = (data.total_emi || 0).toFixed(2);
        

        const remainingBudgetEl = container.querySelector('.remainingBudget');
        if (remainingBudgetEl) {
            remainingBudgetEl.textContent = (data.remaining_budget || 0).toFixed(2);
            remainingBudgetEl.classList.remove('negative', 'positive', 'summary-remaining-negative', 'summary-remaining-positive');
            if (data.remaining_budget < 0) {
                remainingBudgetEl.classList.add('summary-remaining-negative');
            } else {
                remainingBudgetEl.classList.add('summary-remaining-positive');
            }
        }


        const netSavingsEl = container.querySelector('.netSavings');
        if (netSavingsEl) {
            netSavingsEl.textContent = (data.net_savings || 0).toFixed(2);
            netSavingsEl.classList.remove('negative', 'positive', 'summary-remaining-negative', 'summary-remaining-positive');
            if (data.net_savings < 0) {
                netSavingsEl.classList.add('summary-remaining-negative');
            } else {
                netSavingsEl.classList.add('summary-remaining-positive');
            }
        }
        // Mobile summary coloring
        const remainingBudgetMobileEl = container.querySelector('.remainingBudgetMobile');
        if (remainingBudgetMobileEl) {
            remainingBudgetMobileEl.textContent = (data.remaining_budget || 0).toFixed(2);
            remainingBudgetMobileEl.classList.remove('negative', 'positive', 'summary-remaining-negative', 'summary-remaining-positive');
            if (data.remaining_budget < 0) {
                remainingBudgetMobileEl.classList.add('summary-remaining-negative');
            } else {
                remainingBudgetMobileEl.classList.add('summary-remaining-positive');
            }
        }

        const netSavingsMobileEl = container.querySelector('.netSavingsMobile');
        if (netSavingsMobileEl) {
            netSavingsMobileEl.textContent = (data.net_savings || 0).toFixed(2);
            netSavingsMobileEl.classList.remove('negative', 'positive', 'summary-remaining-negative', 'summary-remaining-positive');
            if (data.net_savings < 0) {
                netSavingsMobileEl.classList.add('summary-remaining-negative');
            } else {
                netSavingsMobileEl.classList.add('summary-remaining-positive');
            }
        }

        // Payment Type Totals
        // Fix: Use correct data for payment type totals (use data.expenses, not global expenses)
        let totals = { 'AMEX': 0, 'RBL': 0, 'CASH': 0 };
        (data.expenses || []).forEach(exp => {
            const paymentType = (exp.payment_type || '').toUpperCase();
            if (totals.hasOwnProperty(paymentType)) {
                totals[paymentType] += parseFloat(exp.amount || 0);
            }
        });
        // Use IDs for payment type totals (not class selectors)
        const totalAmexEl = container.querySelector('#totalAmex');
        if(totalAmexEl) totalAmexEl.textContent = totals.AMEX.toFixed(2);

        const totalRblEl = container.querySelector('#totalRbl');
        if(totalRblEl) totalRblEl.textContent = totals.RBL.toFixed(2);

        const totalCashEl = container.querySelector('#totalCash');
        if(totalCashEl) totalCashEl.textContent = totals.CASH.toFixed(2);

        // Budget Report Table
        const tableBody = container.querySelector('.budgetReportTable tbody');
        const tableFoot = container.querySelector('.budgetReportTable tfoot');
        if (tableBody && tableFoot) {
            tableBody.innerHTML = '';
            tableFoot.innerHTML = '';

            const categories = data.doughnut_chart_labels || [];
            categories.forEach((category, index) => {
                const budgeted = (data.budget_values || [])[index] || 0;
                const spent = (data.spent_values || [])[index] || 0;
                const difference = budgeted - spent;
                const row = tableBody.insertRow();
                row.insertCell().textContent = category;
                row.insertCell().textContent = budgeted.toFixed(2);
                row.insertCell().textContent = spent.toFixed(2);
                const diffCell = row.insertCell();
                diffCell.textContent = difference.toFixed(2);
                diffCell.classList.toggle('negative', difference < 0);
                diffCell.classList.toggle('positive', difference >= 0);
            });

            const footerRow = tableFoot.insertRow();
            footerRow.style.fontWeight = 'bold';
            footerRow.insertCell().textContent = 'Overall Total';
            footerRow.insertCell().textContent = (data.total_budget || 0).toFixed(2);
            footerRow.insertCell().textContent = (data.total_expenses || 0).toFixed(2);
            const overallDiffCell = footerRow.insertCell();
            const overallDifference = (data.total_budget || 0) - (data.total_expenses || 0);
            overallDiffCell.textContent = overallDifference.toFixed(2);
            overallDiffCell.classList.toggle('negative', overallDifference < 0);
            overallDiffCell.classList.toggle('positive', overallDifference >= 0);
        }

        // Category Bar Chart
        const chartCanvas = container.querySelector('.categoryBarChart');
        const ctx = chartCanvas?.getContext('2d');
        if (ctx) {
            const chartId = `${view}CategoryBarChart`;
            if (window[chartId]) window[chartId].destroy();

            if (!data.doughnut_chart_labels?.length) {
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.font = "16px Arial";
                ctx.fillStyle = "#888";
                ctx.textAlign = "center";
                ctx.fillText("No data to display chart.", ctx.canvas.width / 2, 50);
                return;
            }

            window[chartId] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.doughnut_chart_labels,
                    datasets: [
                        { label: 'Budgeted', data: data.budget_values, backgroundColor: 'rgba(54, 162, 235, 0.6)' },
                        { label: 'Spent', data: data.spent_values, backgroundColor: 'rgba(255, 99, 132, 0.6)' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 4000 } } },
                    plugins: { legend: { position: 'top' } }
                }
            });
        }
    }

    function renderAllDashboards() {
        renderDashboardForView('desktop');
        renderDashboardForView('mobile');
    }

    // --- LIST RENDERING FUNCTIONS ---
    function createItemActions(itemType, record) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';
        const activeMonth = flaskData.active_month; // Use data from Flask

        const editLink = document.createElement('a');
        editLink.href = `/edit_${itemType}/${record.id}?month_select=${activeMonth}`;
        editLink.className = 'edit-btn';
        editLink.innerHTML = '<i class="fas fa-edit"></i>';

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-btn';
        deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
        deleteButton.onclick = async () => {
            if (confirm(`Are you sure you want to delete this ${itemType} item?`)) {
                try {
                    const response = await fetch(`/api/delete_${itemType}/${record.id}`, { method: 'POST' });
                    const result = await response.json();
                    if (result.status === 'success') {
                        await refreshDashboardData(flaskData.active_month);
                    } else {
                        alert(`Error: ${result.message}`);
                    }
                } catch (error) {
                    console.error(`Failed to delete ${itemType}:`, error);
                    alert(`An error occurred while deleting the ${itemType}.`);
                }
            }
        };

        actionsDiv.appendChild(editLink);
        actionsDiv.appendChild(deleteButton);
        return actionsDiv;
    }

    function renderList(listElement, data, itemType, noDataMessage, createTextContent) {
        if (!listElement) return;
        listElement.innerHTML = '';
        if (!data || data.length === 0) {
            listElement.innerHTML = `<li>${noDataMessage}</li>`;
            return;
        }
        // Detect if this is a mobile list by class
        const isMobile = listElement.classList.contains('mobile-item-list');
        if (isMobile && itemType === 'expense') {
            console.log('[DEBUG] Rendering mobile expense list:', data);
        }
        data.forEach(record => {
            const li = document.createElement('li');
            if (isMobile && itemType === 'expense') {
                // --- MOBILE EXPENSE: date, category, description, amount, actions ---
                li.style.display = 'grid';
                li.style.gridTemplateColumns = 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,2.5fr) minmax(0,1.2fr) auto';
                li.style.alignItems = 'center';
                li.style.gap = '6px';
                li.style.width = '100%';
                li.style.minWidth = '0';

                // Date (MM-DD)
                const dateSpan = document.createElement('span');
                dateSpan.className = 'item-category-date';
                dateSpan.style.fontSize = '0.93em';
                dateSpan.style.color = '#555';
                dateSpan.style.whiteSpace = 'nowrap';
                let shortDate = record.date;
                if (typeof shortDate === 'string' && shortDate.length === 10 && shortDate.includes('-')) {
                    const parts = shortDate.split('-');
                    if (parts.length === 3) {
                        shortDate = parts[1] + '-' + parts[2];
                    }
                }
                dateSpan.textContent = shortDate;
                li.appendChild(dateSpan);

                // Category (first 2 letters, uppercase)
                const catSpan = document.createElement('span');
                catSpan.className = 'item-category-date';
                catSpan.style.fontSize = '0.93em';
                catSpan.style.color = '#555';
                catSpan.style.whiteSpace = 'nowrap';
                let shortCat = record.category ? record.category.slice(0,2).toUpperCase() : '';
                catSpan.textContent = shortCat;
                li.appendChild(catSpan);

                // Description + Payment Type (first letter in brackets)
                const descSpan = document.createElement('span');
                descSpan.className = 'item-description';
                descSpan.style.overflow = 'hidden';
                descSpan.style.textOverflow = 'ellipsis';
                descSpan.style.whiteSpace = 'nowrap';
                descSpan.style.maxWidth = 'none';
                descSpan.style.fontSize = '0.9em';
                descSpan.style.fontWeight = 'normal';
                let descText = record.description || '(No description)';
                let payType = record.payment_type ? record.payment_type.charAt(0).toUpperCase() : '';
                if (payType) {
                    descText += ` [${payType}]`;
                }
                descSpan.textContent = descText;
                li.appendChild(descSpan);

                // Amount
                const amtSpan = document.createElement('span');
                amtSpan.className = 'item-amount';
                amtSpan.style.whiteSpace = 'nowrap';
                amtSpan.style.fontSize = '0.9em';
                amtSpan.style.fontWeight = 'normal';
                amtSpan.style.flexShrink = '0';
                let amountValue = record.amount !== undefined && record.amount !== null && record.amount !== '' ? `₹${parseFloat(record.amount).toFixed(2)}` : '₹0.00';
                amtSpan.textContent = amountValue;
                li.appendChild(amtSpan);

                // Actions
                const actionsDiv = createItemActions(itemType, record);
                actionsDiv.classList.add('mobile-item-actions');
                actionsDiv.style.display = 'flex';
                actionsDiv.style.alignItems = 'center';
                actionsDiv.style.justifyContent = 'flex-end';
                actionsDiv.style.gap = '4px';
                actionsDiv.style.margin = '0 0 0 8px';
                li.appendChild(actionsDiv);
            } else if (isMobile && itemType === 'income') {

                // --- MOBILE INCOME: date, description, amount, actions ---
                li.style.display = 'grid';
                li.style.gridTemplateColumns = 'minmax(0,auto) minmax(0,1fr) minmax(0,1.2fr) auto';
                li.style.alignItems = 'center';
                li.style.gap = '6px';
                li.style.width = '100%';
                li.style.minWidth = '0';
                li.style.paddingLeft = '0';
                li.style.marginLeft = '0';

                // Date
                const dateSpan = document.createElement('span');
                dateSpan.className = 'item-category-date';
                dateSpan.style.fontSize = '0.93em';
                dateSpan.style.color = '#555';
                dateSpan.style.whiteSpace = 'nowrap';
                dateSpan.textContent = record.date || '';
                li.appendChild(dateSpan);

                // Description
                const descSpan = document.createElement('span');
                descSpan.className = 'item-description';
                descSpan.style.overflow = 'hidden';
                descSpan.style.textOverflow = 'ellipsis';
                descSpan.style.whiteSpace = 'nowrap';
                descSpan.style.maxWidth = 'none';
                descSpan.style.fontSize = '0.9em';
                descSpan.style.fontWeight = 'normal';
                descSpan.style.textAlign = 'left';
                descSpan.style.display = 'block';
                descSpan.style.minWidth = '0';
                descSpan.style.paddingLeft = '0';
                descSpan.style.marginLeft = '0';
                descSpan.style.boxSizing = 'border-box';
                descSpan.textContent = record.description || '(No description)';
                li.appendChild(descSpan);

                // Amount
                const amtSpan = document.createElement('span');
                amtSpan.className = 'item-amount';
                amtSpan.style.whiteSpace = 'nowrap';
                amtSpan.style.fontSize = '0.9em';
                amtSpan.style.fontWeight = 'normal';
                amtSpan.style.flexShrink = '0';
                let amountValue = record.amount !== undefined && record.amount !== null && record.amount !== '' ? `₹${parseFloat(record.amount).toFixed(2)}` : '₹0.00';
                amtSpan.textContent = amountValue;
                li.appendChild(amtSpan);

                // Actions
                const actionsDiv = createItemActions(itemType, record);
                actionsDiv.classList.add('mobile-item-actions');
                actionsDiv.style.display = 'flex';
                actionsDiv.style.alignItems = 'center';
                actionsDiv.style.justifyContent = 'flex-end';
                actionsDiv.style.gap = '4px';
                actionsDiv.style.margin = '0 0 0 8px';
                li.appendChild(actionsDiv);
            } else if (isMobile && itemType === 'emi') {
                // --- MOBILE EMI: due_date, loan_name, emi_amount, actions ---
                li.style.display = 'grid';
                li.style.gridTemplateColumns = 'minmax(0,auto) minmax(0,1fr) minmax(0,1.2fr) auto';
                li.style.alignItems = 'center';
                li.style.gap = '6px';
                li.style.width = '100%';
                li.style.minWidth = '0';
                li.style.paddingLeft = '0';
                li.style.marginLeft = '0';

                // Due Date
                const dueDateSpan = document.createElement('span');
                dueDateSpan.className = 'item-category-date';
                dueDateSpan.style.fontSize = '0.93em';
                dueDateSpan.style.color = '#555';
                dueDateSpan.style.whiteSpace = 'nowrap';
                dueDateSpan.textContent = record.due_date || '';
                li.appendChild(dueDateSpan);

                // Loan Name
                const loanSpan = document.createElement('span');
                loanSpan.className = 'item-description';
                loanSpan.style.overflow = 'hidden';
                loanSpan.style.textOverflow = 'ellipsis';
                loanSpan.style.whiteSpace = 'nowrap';
                loanSpan.style.maxWidth = 'none';
                loanSpan.style.fontSize = '0.9em';
                loanSpan.style.fontWeight = 'normal';
                loanSpan.style.textAlign = 'left';
                loanSpan.style.display = 'block';
                loanSpan.style.minWidth = '0';
                loanSpan.style.paddingLeft = '0';
                loanSpan.style.marginLeft = '0';
                loanSpan.style.boxSizing = 'border-box';
                loanSpan.textContent = record.loan_name || '(No name)';
                li.appendChild(loanSpan);

                // EMI Amount
                const emiAmtSpan = document.createElement('span');
                emiAmtSpan.className = 'item-amount';
                emiAmtSpan.style.whiteSpace = 'nowrap';
                emiAmtSpan.style.fontSize = '0.9em';
                emiAmtSpan.style.fontWeight = 'normal';
                emiAmtSpan.style.flexShrink = '0';
                let emiAmountValue = record.emi_amount !== undefined && record.emi_amount !== null && record.emi_amount !== '' ? `₹${parseFloat(record.emi_amount).toFixed(2)}` : '₹0.00';
                emiAmtSpan.textContent = emiAmountValue;
                li.appendChild(emiAmtSpan);

                // Actions
                const actionsDiv = createItemActions(itemType, record);
                actionsDiv.classList.add('mobile-item-actions');
                actionsDiv.style.display = 'flex';
                actionsDiv.style.alignItems = 'center';
                actionsDiv.style.justifyContent = 'flex-end';
                actionsDiv.style.gap = '4px';
                actionsDiv.style.margin = '0 0 0 8px';
                li.appendChild(actionsDiv);
            } else {
                // Desktop or other lists: fallback to old rendering
                const textSpan = document.createElement('span');
                textSpan.innerHTML = createTextContent(record);
                li.appendChild(textSpan);
                li.appendChild(createItemActions(itemType, record));
            }
            listElement.appendChild(li);
        });
    }

    function renderAllLists(expenseData) {
        // Show payment type in desktop expense records
        const expenseContent = r => {
            const paymentType = r.payment_type ? `<span class=\"item-payment-type\" style=\"margin-left:8px;\">[${r.payment_type}]</span>` : '';
            return `${r.date} - ${r.category} - ${r.description}${paymentType}: <b>₹${parseFloat(r.amount).toFixed(2)}</b>`;
        };
        const incomeContent = r => `${r.description}: <b>₹${parseFloat(r.amount).toFixed(2)}</b>`;
        const emiContent = r => `${r.loan_name}: <b>₹${parseFloat(r.emi_amount).toFixed(2)}</b>`;

        // Desktop Lists
        renderList(document.querySelector('#expenseSectionContentDesktop .expenseList'), expenseData, 'expense', 'No expense records for this month.', expenseContent);
        renderList(document.querySelector('#incomeSectionContentDesktop .incomeList'), flaskData.income, 'income', 'No income records for this month.', incomeContent);
        renderList(document.querySelector('#emiSectionContentDesktop .emiList'), flaskData.emis, 'emi', 'No EMI records for this month.', emiContent);

        // Mobile Lists
        const mobileExpenseList = document.querySelector('#expense-content-mobile .expenseList');
        const mobileIncomeList = document.querySelector('#income-content-mobile .incomeList');
        const mobileEmiList = document.querySelector('#emi-content-mobile .emiList');
        renderList(mobileExpenseList, expenseData, 'expense', 'No expense records for this month.', expenseContent);
        renderList(mobileIncomeList, flaskData.income, 'income', 'No income records for this month.', incomeContent);
        renderList(mobileEmiList, flaskData.emis, 'emi', 'No EMI records for this month.', emiContent);
    }


    // --- DATA REFRESH ---
    async function refreshDashboardData(month) {
        console.log(`Refreshing all dashboard data for month: ${month}`);
        
        // Fallback to the value from the month selector input if month is not provided
        const monthToRefresh = month || (document.getElementById('month_select_desktop') ? document.getElementById('month_select_desktop').value : null);

        try {
            if (!monthToRefresh) {
                console.error("Month parameter is missing for refresh.");
                alert("Could not determine the month to refresh. Please select a month.");
                return;
            }

            const response = await fetch(`/api/report_data?month_select=${monthToRefresh}`);
            if (!response.ok) throw new Error(`API error: ${response.status}`);


            const data = await response.json();
            flaskData = data; // Update global data object
            flaskData.active_month = monthToRefresh; // Ensure active_month is set to the requested month
            expenses = data.expenses || [];
            // Ensure income and emis are always arrays for mobile/desktop lists
            flaskData.income = data.income || [];
            flaskData.emis = data.emis || [];

            console.log("Refreshed flaskData via API:", flaskData);

            // Update month inputs to be sure they are synced
            const desktopMonthInput = document.getElementById('month_select_desktop');
            const mobileMonthInput = document.getElementById('month_select_mobile');
            if(desktopMonthInput) desktopMonthInput.value = flaskData.active_month;
            if(mobileMonthInput) mobileMonthInput.value = flaskData.active_month;

            // Update dashboard titles with the new month
            const formattedMonth = new Date(flaskData.active_month + '-02').toLocaleString('default', { month: 'long', year: 'numeric' });
            document.querySelectorAll('#summary-title-desktop, #summary-title-mobile').forEach(el => el.textContent = `Summary for ${formattedMonth}`);
            document.querySelectorAll('#chart-title-desktop, #chart-title-mobile').forEach(el => el.textContent = `Budget vs. Spending for ${formattedMonth}`);
            document.querySelectorAll('#report-title-desktop, #report-title-mobile').forEach(el => el.textContent = `Budget Report for ${formattedMonth}`);

            renderAllDashboards();
            renderAllLists(expenses);
            updateBudgetForms(flaskData.budget || {});

        } catch (error) {
            console.error("Failed to refresh dashboard data:", error);
            alert("Failed to refresh data. Please check the console or try reloading the page.");
        }
    }

    // --- EVENT LISTENERS SETUP ---
    function setupEventListeners() {
        console.log("Setting up event listeners...");

        // Desktop Tabs
        document.querySelectorAll('#desktop-view .tab-button').forEach(button => {
            button.addEventListener('click', function () {
                switchPane(this.dataset.target, 'desktop');
            });
        });

        // Mobile Navigation
        document.querySelectorAll('#mobile-view .nav-item').forEach(item => {
            item.addEventListener('click', function () {
                switchPane(this.dataset.target, 'mobile');
            });
        });

        // Expense Search (for both views)
        document.querySelectorAll('.expenseSearchBox').forEach(searchBox => {
            const container = searchBox.closest('.search-box-container');
            const clearBtn = container.querySelector('.clearExpenseSearch');
            function toggleClearBtn() {
                if (searchBox.value) {
                    container.classList.add('has-text');
                } else {
                    container.classList.remove('has-text');
                }
            }
            searchBox.addEventListener('input', (e) => {
                const searchTerm = (e.target.value || '').toLowerCase();
                const filteredExpenses = expenses.filter(exp => {
                    return searchTerm === '' ||
                           (exp.description || '').toLowerCase().includes(searchTerm) ||
                           (exp.category || '').toLowerCase().includes(searchTerm);
                });
                // Find the list within the same view (desktop or mobile) as the search box
                const viewContainer = e.target.closest('#desktop-view, #mobile-view');
                const expenseList = viewContainer.querySelector('.expenseList');
                renderList(expenseList, filteredExpenses, 'expense', 'No matching expense records.', r => `${r.date} - ${r.category} - ${r.description}: <b>₹${parseFloat(r.amount).toFixed(2)}</b>`);
                toggleClearBtn();
            });
            // Initial state
            toggleClearBtn();
        });

        document.querySelectorAll('.clearExpenseSearch').forEach(clearButton => {
            clearButton.addEventListener('click', (e) => {
                const viewContainer = e.target.closest('#desktop-view, #mobile-view');
                const searchBox = viewContainer.querySelector('.expenseSearchBox');
                if(searchBox) searchBox.value = '';
                const expenseList = viewContainer.querySelector('.expenseList');
                renderList(expenseList, expenses, 'expense', 'No expense records for this month.', r => `${r.date} - ${r.category} - ${r.description}: <b>₹${parseFloat(r.amount).toFixed(2)}</b>`);
            });
        });

        // Month Change Buttons
        const desktopMonthInput = document.getElementById('month_select_desktop');
        const desktopChangeBtn = document.getElementById('changeMonthBtnDesktop');
        if (desktopChangeBtn && desktopMonthInput) {
            desktopChangeBtn.addEventListener('click', () => {
                const newMonth = desktopMonthInput.value;
                if (newMonth) {
                    refreshDashboardData(newMonth);
                }
            });
        }

        const mobileMonthInput = document.getElementById('month_select_mobile');
        const mobileChangeBtn = document.getElementById('changeMonthBtnMobile');
        if (mobileChangeBtn && mobileMonthInput) {
            mobileChangeBtn.addEventListener('click', () => {
                const newMonth = mobileMonthInput.value;
                if (newMonth) {
                    refreshDashboardData(newMonth);
                }
            });
        }

        // Form Submissions via AJAX (for all forms in both views)
        document.querySelectorAll('form[id]').forEach(form => {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formId = form.id;

                // Month selection forms are handled by their own specific listener
                if (formId.startsWith('monthSelectForm')) {
                    return;
                }

                let endpoint = '';
                // Normalize form ID to get the base action, e.g., 'add_expense'
                const action = formId.replace('Form', '').replace('Desktop', '').replace('Mobile', '');

                if (action.startsWith('add')) {
                    endpoint = `/api/${action.replace('add', 'add_')}`.toLowerCase(); // Ensure endpoint is lowercase
                } else if (action === 'setBudget') {
                    endpoint = '/api/set_budgets';
                }

                if (!endpoint) return;

                // --- Ensure month_select is always set to the visible month selector value ---
                let monthInput = null;
                if (form.closest('#desktop-view')) {
                    monthInput = document.getElementById('month_select_desktop');
                } else if (form.closest('#mobile-view')) {
                    monthInput = document.getElementById('month_select_mobile');
                }
                const selectedMonth = monthInput ? monthInput.value : flaskData.active_month;
                let monthField = form.querySelector('input[name="month_select"]');
                if (monthField) {
                    monthField.value = selectedMonth;
                } else {
                    // If not present, add it
                    const hiddenMonth = document.createElement('input');
                    hiddenMonth.type = 'hidden';
                    hiddenMonth.name = 'month_select';
                    hiddenMonth.value = selectedMonth;
                    form.appendChild(hiddenMonth);
                }

                const formData = new FormData(form);

                try {
                    const response = await fetch(endpoint, { method: 'POST', body: formData });
                    if (!response.ok) {
                        let errorText = await response.text();
                        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
                    }
                    let result;
                    try {
                        result = await response.json();
                    } catch (jsonErr) {
                        throw new Error('Server did not return valid JSON.');
                    }

                    if (result.status === 'success') {
                        if (form.id.startsWith('add')) form.reset();
                        await refreshDashboardData(selectedMonth);
                        if (form.closest('#mobile-view')) {
                            switchPane('#dashboard-content-mobile', 'mobile');
                        }
                    } else {
                        alert(`Error: ${result.message || 'Unknown error.'}`);
                    }
                } catch (error) {
                    console.error(`Form submission error for ${formId}:`, error);
                    alert('An error occurred.');
                }
            });
        });
        
        // Redundant month selector form submission listeners removed.
        // The button click handlers for 'changeMonthBtnDesktop' and 'changeMonthBtnMobile'
        // already cover this functionality correctly.
    }

    // --- NEW FUNCTION TO UPDATE BUDGET FORMS ---
    function updateBudgetForms(budgetData) {
        console.log("Updating budget forms with data:", budgetData);
        const categories = ['Food', 'Cloth', 'Online', 'Miscellaneous', 'Other'];

        // Update both desktop and mobile forms
        ['Desktop', 'Mobile'].forEach(view => {
            const form = document.getElementById(`setBudgetForm${view}`);
            if (form) {
                categories.forEach(category => {
                    const input = form.querySelector(`input[name="${category}"]`);
                    if (input) {
                        // Use the value from budgetData, or default to 0 if not present
                        const budgetValue = budgetData[category] !== undefined && budgetData[category] !== null ? parseFloat(budgetData[category]) : 0;
                        input.value = budgetValue; // Set as a number, not a formatted string
                    }
                });
            }
        });
    }

    // --- INITIALIZATION ---
    function initializeApp() {
        // Check if on the main page vs. an edit page
        if (document.getElementById('desktop-view') && document.getElementById('mobile-view')) {
            console.log("Initializing main application...");
            
            // Initial data fetch and render before setting up listeners
            // that might depend on the data being present.
            refreshDashboardData(flaskData.active_month).then(() => {
                setupEventListeners();
            
                // Set the initial active pane for desktop
                const desktopInitialButton = document.querySelector('#desktop-view .tab-button.active');
                const desktopInitialTarget = desktopInitialButton ? desktopInitialButton.dataset.target : '#expenseSectionContentDesktop';
                console.log("Initial desktop pane:", desktopInitialTarget);
                switchPane(desktopInitialTarget, 'desktop');

                // Set the initial active pane for mobile
                const mobileInitialButton = document.querySelector('#mobile-view .nav-item.active');
                const mobileInitialTarget = mobileInitialButton ? mobileInitialButton.dataset.target : '#dashboard-content-mobile';
                switchPane(mobileInitialTarget, 'mobile');
            });
        }
    }

    initializeApp();
});
