document.addEventListener('DOMContentLoaded', function () {

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/static/service-worker.js').catch(error => {
                console.error('Service worker registration failed:', error);
            });
        });
    }

    // --- GLOBAL DATA ---
    const flaskDataScript = document.getElementById('flask-data');
    let flaskData = {};
    if (flaskDataScript) {
        try {
            flaskData = JSON.parse(flaskDataScript.getAttribute('data-json'));
            // Also load category_options from data-categories attribute
            const categoriesAttr = flaskDataScript.getAttribute('data-categories');
            if (categoriesAttr) {
                flaskData.category_options = JSON.parse(categoriesAttr);
            }
        } catch (e) {
            console.error("Error parsing Flask data:", e);
            flaskData = {};
        }
    }
    let expenses = flaskData.expenses || [];
    let activeBudgetEditId = null;
    let activeInlineEdit = null;

    function getSafeErrorMessage(error, fallbackMessage) {
        const message = (error && error.message ? error.message : '').trim();
        if (!message) {
            return fallbackMessage;
        }
        if (message.startsWith('<!DOCTYPE html') || message.startsWith('<html')) {
            return fallbackMessage;
        }
        return message.length > 180 ? fallbackMessage : message;
    }

    function syncBudgetRecord(updatedBudget) {
        if (!updatedBudget) return;

        const updatedAmount = parseFloat(updatedBudget.amount);
        flaskData.budgets_list = (flaskData.budgets_list || []).map(record =>
            record.id === updatedBudget.id
                ? { ...record, category: updatedBudget.category, amount: updatedAmount }
                : record
        );

        flaskData.budget = Object.fromEntries(
            (flaskData.budgets_list || []).map(record => [record.category, parseFloat(record.amount)])
        );
    }

    // --- DATALIST HELPER (improve UX for payment method and category selection) ---
    function setupDatalistInputs() {
        const toggleTargets = [
            { inputSelector: 'input[list="paymentTypeOptions"]', containerSelector: '.payment-input-container', clearSelector: '.clearPaymentInput' },
            { inputSelector: 'input[list="categoryOptions"]', containerSelector: '.category-input-container', clearSelector: '.clearCategoryInput' }
        ];

        function toggleInlineClear(input, containerSelector) {
            const container = input.closest(containerSelector);
            if (!container) return;
            if ((input.value || '').trim()) {
                container.classList.add('has-text');
            } else {
                container.classList.remove('has-text');
            }
        }

        toggleTargets.forEach(target => {
            const inputs = document.querySelectorAll(target.inputSelector);
            inputs.forEach(input => {
                input.addEventListener('input', () => toggleInlineClear(input, target.containerSelector));
                input.addEventListener('change', () => toggleInlineClear(input, target.containerSelector));
                input.addEventListener('click', function() {
                    this.focus();
                });
                toggleInlineClear(input, target.containerSelector);
            });
        });

        document.querySelectorAll('.clearPaymentInput, .clearCategoryInput').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const targetId = this.getAttribute('data-target');
                let input = targetId ? document.getElementById(targetId) : null;
                if (!input) {
                    input = this.closest('div')?.querySelector('input[type="text"][list]') || null;
                }
                if (input) {
                    input.value = '';
                    input.focus();
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    const isCategory = input.getAttribute('list') === 'categoryOptions';
                    toggleInlineClear(input, isCategory ? '.category-input-container' : '.payment-input-container');
                }
            });
        });

        // Suppress browser autocomplete/autofill suggestions on category inputs
        // Use datalist exclusively - no browser history suggestions
        document.querySelectorAll('input[list="categoryOptions"]').forEach(input => {
            // Force autocomplete off at all times
            input.setAttribute('autocomplete', 'off');
            
            input.addEventListener('focus', function() {
                this.setAttribute('autocomplete', 'off');
            });
            
            input.addEventListener('keydown', function(e) {
                // Block arrow down key to prevent browser suggestions from appearing
                if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                }
            });
            
            // Prevent autocomplete from showing by clearing it periodically
            input.addEventListener('input', function() {
                this.setAttribute('autocomplete', 'off');
            });
        });
    }

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

        if (targetId === '#weekly-content-mobile' || targetId === '#budgetSectionContentDesktop') {
            loadWeeklyBudgets(flaskData.active_month);
        }
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

        // Payment Method Totals (dynamic, public-friendly)
        const paymentTotals = {};
        (data.expenses || []).forEach(exp => {
            const raw = (exp.payment_type || 'Unknown').toString().trim() || 'Unknown';
            // Normalise to Title Case so 'CASH', 'cash', 'Cash' all merge into 'Cash'
            const method = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
            paymentTotals[method] = (paymentTotals[method] || 0) + parseFloat(exp.amount || 0);
        });

        const totalsContainer = view === 'desktop'
            ? container.querySelector('#paymentTypeTotalsDesktop')
            : container.querySelector('#paymentTypeTotalsMobile');

        if (totalsContainer) {
            totalsContainer.innerHTML = '';
            const sortedMethods = Object.entries(paymentTotals)
                .sort((first, second) => second[1] - first[1]);

            if (!sortedMethods.length) {
                const empty = document.createElement('div');
                empty.style.color = '#6b7280';
                empty.textContent = 'No expense records yet.';
                totalsContainer.appendChild(empty);
            } else {
                const list = document.createElement('div');
                list.style.display = 'grid';
                list.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
                list.style.gap = '10px';

                sortedMethods.forEach(([method, total]) => {
                    const item = document.createElement('div');
                    item.style.background = '#f8fafc';
                    item.style.border = '1px solid #e5e7eb';
                    item.style.borderRadius = '8px';
                    item.style.padding = '8px 10px';

                    const label = document.createElement('div');
                    label.style.fontWeight = '600';
                    label.style.color = '#334155';
                    label.textContent = method;

                    const value = document.createElement('div');
                    value.style.color = '#0f766e';
                    value.style.marginTop = '2px';
                    value.textContent = `₹${total.toFixed(2)}`;

                    item.appendChild(label);
                    item.appendChild(value);
                    list.appendChild(item);
                });

                totalsContainer.appendChild(list);
            }
        }

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

        // Category Donut Chart (dual-ring: outer = budgeted, inner = spent)
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

            // Palette — one color per category, outer ring full opacity, inner ring lighter
            const palette = [
                '#1e40af', '#0891b2', '#059669', '#d97706', '#dc2626',
                '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0284c7',
                '#9333ea', '#e11d48', '#b45309', '#0d9488', '#4338ca'
            ];
            const n = data.doughnut_chart_labels.length;
            const outerColors = data.doughnut_chart_labels.map((_, i) => palette[i % palette.length]);
            const innerColors = data.doughnut_chart_labels.map((_, i) => palette[i % palette.length] + '99'); // 60% opacity

            const totalSpent = (data.spent_values || []).reduce((a, b) => a + b, 0);
            const totalBudget = (data.budget_values || []).reduce((a, b) => a + b, 0);

            // Center text plugin
            const centerTextPlugin = {
                id: `centerText_${view}`,
                afterDraw(chart) {
                    const { ctx: c, chartArea: { top, bottom, left, right } } = chart;
                    const cx = (left + right) / 2;
                    const cy = (top + bottom) / 2;
                    c.save();
                    c.textAlign = 'center';
                    c.textBaseline = 'middle';
                    c.font = 'bold 13px system-ui, sans-serif';
                    c.fillStyle = '#64748b';
                    c.fillText('SPENT', cx, cy - 18);
                    c.font = 'bold 22px system-ui, sans-serif';
                    c.fillStyle = totalSpent > totalBudget ? '#dc2626' : '#1e40af';
                    c.fillText('₹' + totalSpent.toLocaleString('en-IN', { maximumFractionDigits: 0 }), cx, cy + 6);
                    c.font = '11px system-ui, sans-serif';
                    c.fillStyle = '#94a3b8';
                    c.fillText('of ₹' + totalBudget.toLocaleString('en-IN', { maximumFractionDigits: 0 }), cx, cy + 26);
                    c.restore();
                }
            };

            window[chartId] = new Chart(ctx, {
                type: 'doughnut',
                plugins: [centerTextPlugin],
                data: {
                    labels: data.doughnut_chart_labels,
                    datasets: [
                        {
                            label: 'Budgeted',
                            data: data.budget_values,
                            backgroundColor: outerColors,
                            borderColor: '#ffffff',
                            borderWidth: 3,
                            hoverOffset: 8,
                            weight: 1.4
                        },
                        {
                            label: 'Spent',
                            data: data.spent_values,
                            backgroundColor: innerColors,
                            borderColor: '#ffffff',
                            borderWidth: 3,
                            hoverOffset: 8,
                            weight: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '52%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: 'rgba(71, 85, 105, 0.9)',
                                font: { size: 12 },
                                padding: 14,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                // Only show category labels once (not per dataset)
                                filter: (item) => item.datasetIndex === 0
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.92)',
                            titleColor: '#f1f5f9',
                            bodyColor: '#cbd5e1',
                            borderColor: 'rgba(59, 130, 246, 0.5)',
                            borderWidth: 1,
                            cornerRadius: 10,
                            padding: 12,
                            callbacks: {
                                title(items) {
                                    return items[0].label;
                                },
                                label(item) {
                                    const isOuter = item.datasetIndex === 0;
                                    const val = item.parsed;
                                    const label = isOuter ? 'Budgeted' : 'Spent';
                                    return `  ${label}: ₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
                                },
                                afterBody(items) {
                                    const idx = items[0].dataIndex;
                                    const budget = (data.budget_values || [])[idx] || 0;
                                    const spent = (data.spent_values || [])[idx] || 0;
                                    const diff = budget - spent;
                                    const sign = diff >= 0 ? '✅ Under by' : '⚠️ Over by';
                                    return [`  ${sign}: ₹${Math.abs(diff).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`];
                                }
                            }
                        }
                    },
                    animation: {
                        duration: 900,
                        easing: 'easeOutQuart'
                    }
                }
            });
        }
    }

    function renderAllDashboards() {
        renderDashboardForView('desktop');
        renderDashboardForView('mobile');
    }

    // --- LIST RENDERING FUNCTIONS ---
    function renderBudgetListItem(li, record, listElement) {
        if (activeBudgetEditId === record.id) {
            li.classList.add('budget-inline-editing');

            const editor = document.createElement('div');
            editor.className = 'budget-inline-editor';

            const fieldsGroup = document.createElement('div');
            fieldsGroup.className = 'budget-inline-fields';

            const categoryInput = document.createElement('input');
            categoryInput.type = 'text';
            categoryInput.value = record.category || '';
            categoryInput.className = 'budget-inline-input budget-inline-category';
            categoryInput.autocomplete = 'off';
            categoryInput.spellcheck = false;

            const separator = document.createElement('span');
            separator.className = 'budget-inline-separator';
            separator.textContent = ':';

            const currencyPrefix = document.createElement('span');
            currencyPrefix.className = 'budget-inline-currency';
            currencyPrefix.textContent = '₹';

            const amountInput = document.createElement('input');
            amountInput.type = 'text';
            amountInput.inputMode = 'decimal';
            amountInput.value = record.amount ?? '';
            amountInput.className = 'budget-inline-input budget-inline-amount';
            amountInput.autocomplete = 'off';
            amountInput.spellcheck = false;

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'item-actions';

            const saveButton = document.createElement('button');
            saveButton.className = 'edit-btn budget-inline-save';
            saveButton.textContent = 'Save';
            saveButton.onclick = async () => {
                const category = categoryInput.value.trim();
                const amount = amountInput.value;

                if (!category || amount === '') {
                    showToast('error', 'Validation Error', 'Category and amount are required.');
                    return;
                }

                try {
                    const response = await fetch(`/api/edit_budget/${record.id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ category, amount })
                    });
                    const result = await response.json();

                    if (result.status === 'success') {
                        syncBudgetRecord(result.budget);
                        activeBudgetEditId = null;
                        await refreshDashboardData(flaskData.active_month);
                        showToast('success', 'Updated!', 'Budget item has been updated successfully.');
                    } else {
                        showToast('error', 'Update Failed', result.message || 'Failed to update budget item.');
                    }
                } catch (error) {
                    console.error('Failed to edit budget:', error);
                    showToast('error', 'Network Error', 'An error occurred while updating the budget. Please try again.');
                }
            };

            const cancelButton = document.createElement('button');
            cancelButton.className = 'budget-inline-cancel';
            cancelButton.textContent = 'Cancel';
            cancelButton.onclick = () => {
                activeBudgetEditId = null;
                renderList(listElement, flaskData.budgets_list, 'budget', 'No budget records for this month.', r => `${r.category}: <b>₹${parseFloat(r.amount).toFixed(2)}</b>`);
            };

            actionsDiv.appendChild(saveButton);
            actionsDiv.appendChild(cancelButton);

            fieldsGroup.appendChild(categoryInput);
            fieldsGroup.appendChild(separator);
            fieldsGroup.appendChild(currencyPrefix);
            fieldsGroup.appendChild(amountInput);

            editor.appendChild(fieldsGroup);
            editor.appendChild(actionsDiv);
            li.appendChild(editor);

            setTimeout(() => {
                amountInput.focus();
                const cursorPos = amountInput.value.length;
                amountInput.setSelectionRange(cursorPos, cursorPos);
            }, 0);
            return;
        }

        const textSpan = document.createElement('span');
        textSpan.innerHTML = `${record.category}: <b>₹${parseFloat(record.amount).toFixed(2)}</b>`;
        li.appendChild(textSpan);
        li.appendChild(createItemActions('budget', record, listElement));
    }

    function renderInlineRecordEditor(li, itemType, record) {
        li.classList.add('budget-inline-editing');

        const editor = document.createElement('div');
        editor.className = 'budget-inline-editor';

        const fieldsGroup = document.createElement('div');
        fieldsGroup.className = 'budget-inline-fields';

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'budget-inline-input budget-inline-category';
        labelInput.autocomplete = 'off';
        labelInput.spellcheck = false;
        labelInput.value = itemType === 'income' ? (record.description || '') : (record.loan_name || '');

        const separator = document.createElement('span');
        separator.className = 'budget-inline-separator';
        separator.textContent = ':';

        const currencyPrefix = document.createElement('span');
        currencyPrefix.className = 'budget-inline-currency';
        currencyPrefix.textContent = '₹';

        const amountInput = document.createElement('input');
        amountInput.type = 'text';
        amountInput.inputMode = 'decimal';
        amountInput.className = 'budget-inline-input budget-inline-amount';
        amountInput.autocomplete = 'off';
        amountInput.spellcheck = false;
        amountInput.value = itemType === 'income' ? (record.amount ?? '') : (record.emi_amount ?? '');

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';

        const saveButton = document.createElement('button');
        saveButton.className = 'edit-btn budget-inline-save';
        saveButton.textContent = 'Save';
        saveButton.onclick = async () => {
            const labelValue = labelInput.value.trim();
            const amountValue = amountInput.value.trim();

            if (!labelValue || amountValue === '') {
                showToast('error', 'Validation Error', 'All fields are required.');
                return;
            }

            const payload = new URLSearchParams();
            if (itemType === 'income') {
                payload.append('description', labelValue);
                payload.append('amount', amountValue);
                payload.append('month_select', flaskData.active_month);
            } else {
                payload.append('loan_name', labelValue);
                payload.append('emi_amount', amountValue);
                payload.append('month', flaskData.active_month);
            }

            try {
                const response = await fetch(`/api/edit_${itemType}/${record.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: payload.toString()
                });
                const result = await response.json();

                if (result.status === 'success') {
                    activeInlineEdit = null;
                    await refreshDashboardData(flaskData.active_month);
                    showToast('success', 'Updated!', `${itemType.toUpperCase()} item has been updated successfully.`);
                } else {
                    showToast('error', 'Update Failed', result.message || `Failed to update ${itemType} item.`);
                }
            } catch (error) {
                console.error(`Failed to edit ${itemType}:`, error);
                showToast('error', 'Network Error', `An error occurred while updating the ${itemType}. Please try again.`);
            }
        };

        const cancelButton = document.createElement('button');
        cancelButton.className = 'budget-inline-cancel';
        cancelButton.textContent = 'Cancel';
        cancelButton.onclick = () => {
            activeInlineEdit = null;
            renderAllLists(expenses);
        };

        actionsDiv.appendChild(saveButton);
        actionsDiv.appendChild(cancelButton);

        fieldsGroup.appendChild(labelInput);
        fieldsGroup.appendChild(separator);
        fieldsGroup.appendChild(currencyPrefix);
        fieldsGroup.appendChild(amountInput);

        editor.appendChild(fieldsGroup);
        editor.appendChild(actionsDiv);
        li.appendChild(editor);

        setTimeout(() => {
            amountInput.focus();
            const cursorPos = amountInput.value.length;
            amountInput.setSelectionRange(cursorPos, cursorPos);
        }, 0);
    }

    function createItemActions(itemType, record, listElement = null) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';
        const activeMonth = flaskData.active_month; // Use data from Flask

        // For budget items, use inline edit buttons instead of linking to edit page
        if (itemType === 'budget') {
            const editButton = document.createElement('button');
            editButton.className = 'edit-btn';
            editButton.innerHTML = '<i class="fas fa-edit"></i>';
            editButton.onclick = () => {
                activeInlineEdit = null;
                activeBudgetEditId = record.id;
                renderAllLists(expenses);
            };

            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-btn';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.onclick = async () => {
                if (confirm(`Are you sure you want to delete this budget item?`)) {
                    try {
                        const response = await fetch(`/api/delete_budget/${record.id}`, { method: 'POST' });
                        const result = await response.json();
                        if (result.status === 'success') {
                            await refreshDashboardData(flaskData.active_month);
                            showToast('success', 'Deleted!', 'Budget item has been deleted successfully.');
                        } else {
                            showToast('error', 'Delete Failed', result.message || 'Failed to delete budget item.');
                        }
                    } catch (error) {
                        console.error('Failed to delete budget:', error);
                        showToast('error', 'Network Error', 'An error occurred while deleting the budget. Please try again.');
                    }
                }
            };

            actionsDiv.appendChild(editButton);
            actionsDiv.appendChild(deleteButton);
            return actionsDiv;
        }

        if (itemType === 'income' || itemType === 'emi') {
            const editButton = document.createElement('button');
            editButton.className = 'edit-btn';
            editButton.innerHTML = '<i class="fas fa-edit"></i>';
            editButton.onclick = () => {
                activeBudgetEditId = null;
                activeInlineEdit = { type: itemType, id: record.id };
                renderAllLists(expenses);
            };

            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-btn';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.onclick = async () => {
                if (confirm(`Are you sure you want to delete this ${itemType} item?`)) {
                    try {
                        const response = await fetch(`/api/delete_${itemType}/${record.id}`, { method: 'POST' });
                        const result = await response.json();
                        if (result.status === 'success') {
                            activeInlineEdit = null;
                            await refreshDashboardData(flaskData.active_month);
                            showToast('success', 'Deleted!', `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} item has been deleted successfully.`);
                        } else {
                            showToast('error', 'Delete Failed', result.message || `Failed to delete ${itemType} item.`);
                        }
                    } catch (error) {
                        console.error(`Failed to delete ${itemType}:`, error);
                        showToast('error', 'Network Error', `An error occurred while deleting the ${itemType}. Please try again.`);
                    }
                }
            };

            actionsDiv.appendChild(editButton);
            actionsDiv.appendChild(deleteButton);
            return actionsDiv;
        }

        // For expense items, open popup modal instead of navigating
        if (itemType === 'expense') {
            const editButton = document.createElement('button');
            editButton.className = 'edit-btn';
            editButton.innerHTML = '<i class="fas fa-edit"></i>';
            editButton.onclick = () => openEditExpenseModal(record.id);

            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-btn';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.onclick = async () => {
                if (confirm(`Are you sure you want to delete this expense?`)) {
                    try {
                        const response = await fetch(`/api/delete_expense/${record.id}`, { method: 'POST' });
                        const result = await response.json();
                        if (result.status === 'success') {
                            await refreshDashboardData(flaskData.active_month);
                            showToast('success', 'Deleted!', 'Expense has been deleted successfully.');
                        } else {
                            showToast('error', 'Delete Failed', result.message || 'Failed to delete expense.');
                        }
                    } catch (error) {
                        console.error('Failed to delete expense:', error);
                        showToast('error', 'Network Error', 'An error occurred while deleting the expense. Please try again.');
                    }
                }
            };
            actionsDiv.appendChild(editButton);
            actionsDiv.appendChild(deleteButton);
            return actionsDiv;
        }

        // For other item types, use navigation to edit page
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
                        showToast('success', 'Deleted!', `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} item has been deleted successfully.`);
                    } else {
                        showToast('error', 'Delete Failed', result.message || `Failed to delete ${itemType} item.`);
                    }
                } catch (error) {
                    console.error(`Failed to delete ${itemType}:`, error);
                    showToast('error', 'Network Error', `An error occurred while deleting the ${itemType}. Please try again.`);
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
            if (itemType === 'budget') {
                renderBudgetListItem(li, record, listElement);
                listElement.appendChild(li);
                return;
            }

            if ((itemType === 'income' || itemType === 'emi') && activeInlineEdit && activeInlineEdit.type === itemType && activeInlineEdit.id === record.id) {
                renderInlineRecordEditor(li, itemType, record);
                listElement.appendChild(li);
                return;
            }

            if (isMobile && itemType === 'expense') {
                // --- MOBILE EXPENSE: Modern Card Layout ---
                li.style.display = 'block';
                li.style.padding = '12px';
                li.style.margin = '0 0 8px 0';
                li.style.backgroundColor = '#fff';
                li.style.border = '1px solid #e5e7eb';
                li.style.borderRadius = '8px';
                li.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';

                // Main container for expense info
                const mainContainer = document.createElement('div');
                mainContainer.style.display = 'flex';
                mainContainer.style.justifyContent = 'space-between';
                mainContainer.style.alignItems = 'flex-start';
                mainContainer.style.marginBottom = '8px';

                // Left side - Description and meta info
                const leftSide = document.createElement('div');
                leftSide.style.flex = '1';
                leftSide.style.minWidth = '0';

                // Description (primary info)
                const descSpan = document.createElement('div');
                descSpan.style.fontSize = '1.05em';
                descSpan.style.fontWeight = '600';
                descSpan.style.color = '#1f2937';
                descSpan.style.marginBottom = '4px';
                descSpan.style.lineHeight = '1.3';
                descSpan.style.wordWrap = 'break-word';
                descSpan.textContent = record.description || '(No description)';
                leftSide.appendChild(descSpan);

                // Meta info container (date, category, payment type)
                const metaContainer = document.createElement('div');
                metaContainer.style.display = 'flex';
                metaContainer.style.flexWrap = 'wrap';
                metaContainer.style.gap = '8px';
                metaContainer.style.fontSize = '0.85em';
                metaContainer.style.color = '#6b7280';

                // Date
                const dateSpan = document.createElement('span');
                dateSpan.style.backgroundColor = '#f3f4f6';
                dateSpan.style.padding = '2px 6px';
                dateSpan.style.borderRadius = '4px';
                dateSpan.style.fontSize = '0.8em';
                dateSpan.style.fontWeight = '500';
                const displayDate = record.date ? new Date(record.date).toLocaleDateString('en-GB', { 
                    day: '2-digit', 
                    month: 'short' 
                }) : 'No date';
                dateSpan.textContent = displayDate;
                metaContainer.appendChild(dateSpan);

                // Category
                const catSpan = document.createElement('span');
                catSpan.style.backgroundColor = '#f3f4f6';
                catSpan.style.padding = '2px 6px';
                catSpan.style.borderRadius = '4px';
                catSpan.style.fontSize = '0.8em';
                catSpan.style.fontWeight = '500';
                catSpan.textContent = record.category || 'Other';
                metaContainer.appendChild(catSpan);

                // Payment type
                if (record.payment_type) {
                    const paymentSpan = document.createElement('span');
                    paymentSpan.style.backgroundColor = '#f3f4f6';
                    paymentSpan.style.padding = '2px 6px';
                    paymentSpan.style.borderRadius = '4px';
                    paymentSpan.style.fontSize = '0.8em';
                    paymentSpan.style.fontWeight = '500';
                    paymentSpan.textContent = record.payment_type;
                    metaContainer.appendChild(paymentSpan);
                }

                leftSide.appendChild(metaContainer);
                mainContainer.appendChild(leftSide);

                // Right side - Amount
                const rightSide = document.createElement('div');
                rightSide.style.display = 'flex';
                rightSide.style.flexDirection = 'column';
                rightSide.style.alignItems = 'flex-end';
                rightSide.style.marginLeft = '12px';

                const amtSpan = document.createElement('div');
                amtSpan.style.fontSize = '1.1em';
                amtSpan.style.fontWeight = '700';
                amtSpan.style.color = '#475569';
                amtSpan.style.whiteSpace = 'nowrap';
                const amountValue = record.amount !== undefined && record.amount !== null && record.amount !== '' 
                    ? `₹${parseFloat(record.amount).toFixed(2)}` 
                    : '₹0.00';
                amtSpan.textContent = amountValue;
                rightSide.appendChild(amtSpan);

                mainContainer.appendChild(rightSide);
                li.appendChild(mainContainer);

                // Actions row
                const actionsContainer = document.createElement('div');
                actionsContainer.style.borderTop = '1px solid #f3f4f6';
                actionsContainer.style.paddingTop = '8px';
                actionsContainer.style.display = 'flex';
                actionsContainer.style.justifyContent = 'flex-end';

                const actionsDiv = createItemActions(itemType, record);
                actionsDiv.classList.add('mobile-item-actions');
                actionsDiv.style.display = 'flex';
                actionsDiv.style.alignItems = 'center';
                actionsDiv.style.gap = '8px';
                
                // Style action buttons for better mobile experience
                const actionButtons = actionsDiv.querySelectorAll('a, button');
                actionButtons.forEach(btn => {
                    btn.style.padding = '6px 12px';
                    btn.style.fontSize = '0.85em';
                    btn.style.borderRadius = '6px';
                    btn.style.textDecoration = 'none';
                    btn.style.border = 'none';
                    btn.style.setProperty('color', 'white', 'important');
                    btn.style.fontWeight = '500';
                    btn.style.transition = 'all 0.2s';
                    btn.style.minWidth = '50px';
                    btn.style.textAlign = 'center';
                    
                    // Apply specific background colors based on button type
                    if (btn.classList.contains('edit-btn') || btn.textContent.toLowerCase().includes('edit')) {
                        btn.style.setProperty('background', 'linear-gradient(135deg, #6b7280, #4b5563)', 'important');
                    } else if (btn.classList.contains('delete-btn') || btn.textContent.toLowerCase().includes('delete')) {
                        btn.style.setProperty('background', 'linear-gradient(135deg, #ef4444, #dc2626)', 'important');
                    }
                });

                actionsContainer.appendChild(actionsDiv);
                li.appendChild(actionsContainer);
            } else if (isMobile && itemType === 'income') {
                // --- MOBILE INCOME: Modern Card Layout ---
                li.style.display = 'block';
                li.style.padding = '12px';
                li.style.margin = '0 0 8px 0';
                li.style.backgroundColor = '#fff';
                li.style.border = '1px solid #e5e7eb';
                li.style.borderRadius = '8px';
                li.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';

                // Main container
                const mainContainer = document.createElement('div');
                mainContainer.style.display = 'flex';
                mainContainer.style.justifyContent = 'space-between';
                mainContainer.style.alignItems = 'flex-start';
                mainContainer.style.marginBottom = '8px';

                // Left side - Description and date
                const leftSide = document.createElement('div');
                leftSide.style.flex = '1';
                leftSide.style.minWidth = '0';

                // Description (primary info)
                const descSpan = document.createElement('div');
                descSpan.style.fontSize = '1.05em';
                descSpan.style.fontWeight = '600';
                descSpan.style.color = '#1f2937';
                descSpan.style.marginBottom = '4px';
                descSpan.style.lineHeight = '1.3';
                descSpan.style.wordWrap = 'break-word';
                descSpan.textContent = record.description || '(No description)';
                leftSide.appendChild(descSpan);

                // Date info
                if (record.date) {
                    const dateSpan = document.createElement('div');
                    dateSpan.style.fontSize = '0.85em';
                    dateSpan.style.color = '#6b7280';
                    const displayDate = new Date(record.date).toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: 'short',
                        year: 'numeric'
                    });
                    dateSpan.textContent = displayDate;
                    leftSide.appendChild(dateSpan);
                }

                mainContainer.appendChild(leftSide);

                // Right side - Amount
                const rightSide = document.createElement('div');
                rightSide.style.display = 'flex';
                rightSide.style.flexDirection = 'column';
                rightSide.style.alignItems = 'flex-end';
                rightSide.style.marginLeft = '12px';

                const amtSpan = document.createElement('div');
                amtSpan.style.fontSize = '1.1em';
                amtSpan.style.fontWeight = '700';
                amtSpan.style.color = '#059669';
                amtSpan.style.whiteSpace = 'nowrap';
                const amountValue = record.amount !== undefined && record.amount !== null && record.amount !== '' 
                    ? `₹${parseFloat(record.amount).toFixed(2)}` 
                    : '₹0.00';
                amtSpan.textContent = amountValue;
                rightSide.appendChild(amtSpan);

                mainContainer.appendChild(rightSide);
                li.appendChild(mainContainer);

                // Actions row
                const actionsContainer = document.createElement('div');
                actionsContainer.style.borderTop = '1px solid #f3f4f6';
                actionsContainer.style.paddingTop = '8px';
                actionsContainer.style.display = 'flex';
                actionsContainer.style.justifyContent = 'flex-end';

                const actionsDiv = createItemActions(itemType, record);
                actionsDiv.classList.add('mobile-item-actions');
                actionsContainer.appendChild(actionsDiv);
                li.appendChild(actionsContainer);
            } else if (isMobile && itemType === 'emi') {
                // --- MOBILE EMI: Modern Card Layout ---
                li.style.display = 'block';
                li.style.padding = '12px';
                li.style.margin = '0 0 8px 0';
                li.style.backgroundColor = '#fff';
                li.style.border = '1px solid #e5e7eb';
                li.style.borderRadius = '8px';
                li.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';

                // Main container
                const mainContainer = document.createElement('div');
                mainContainer.style.display = 'flex';
                mainContainer.style.justifyContent = 'space-between';
                mainContainer.style.alignItems = 'flex-start';
                mainContainer.style.marginBottom = '8px';

                // Left side - Loan name and due date
                const leftSide = document.createElement('div');
                leftSide.style.flex = '1';
                leftSide.style.minWidth = '0';

                // Loan name (primary info)
                const loanSpan = document.createElement('div');
                loanSpan.style.fontSize = '1.05em';
                loanSpan.style.fontWeight = '600';
                loanSpan.style.color = '#1f2937';
                loanSpan.style.marginBottom = '4px';
                loanSpan.style.lineHeight = '1.3';
                loanSpan.style.wordWrap = 'break-word';
                loanSpan.textContent = record.loan_name || '(No name)';
                leftSide.appendChild(loanSpan);

                // Due date info
                if (record.due_date) {
                    const dueDateSpan = document.createElement('div');
                    dueDateSpan.style.fontSize = '0.85em';
                    dueDateSpan.style.color = '#6b7280';
                    dueDateSpan.textContent = `Due: ${record.due_date}`;
                    leftSide.appendChild(dueDateSpan);
                }

                mainContainer.appendChild(leftSide);

                // Right side - EMI Amount
                const rightSide = document.createElement('div');
                rightSide.style.display = 'flex';
                rightSide.style.flexDirection = 'column';
                rightSide.style.alignItems = 'flex-end';
                rightSide.style.marginLeft = '12px';

                const emiAmtSpan = document.createElement('div');
                emiAmtSpan.style.fontSize = '1.1em';
                emiAmtSpan.style.fontWeight = '700';
                emiAmtSpan.style.color = '#dc2626';
                emiAmtSpan.style.whiteSpace = 'nowrap';
                const emiAmountValue = record.emi_amount !== undefined && record.emi_amount !== null && record.emi_amount !== '' 
                    ? `₹${parseFloat(record.emi_amount).toFixed(2)}` 
                    : '₹0.00';
                emiAmtSpan.textContent = emiAmountValue;
                rightSide.appendChild(emiAmtSpan);

                mainContainer.appendChild(rightSide);
                li.appendChild(mainContainer);

                // Actions row
                const actionsContainer = document.createElement('div');
                actionsContainer.style.borderTop = '1px solid #f3f4f6';
                actionsContainer.style.paddingTop = '8px';
                actionsContainer.style.display = 'flex';
                actionsContainer.style.justifyContent = 'flex-end';

                const actionsDiv = createItemActions(itemType, record);
                actionsDiv.classList.add('mobile-item-actions');
                actionsContainer.appendChild(actionsDiv);
                li.appendChild(actionsContainer);
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
        const budgetContent = r => `${r.category}: <b>₹${parseFloat(r.amount).toFixed(2)}</b>`;

        // Desktop Lists
        renderList(document.querySelector('#expenseSectionContentDesktop .expenseList'), expenseData, 'expense', 'No expense records for this month.', expenseContent);
        renderList(document.querySelector('#incomeSectionContentDesktop .incomeList'), flaskData.income, 'income', 'No income records for this month.', incomeContent);
        renderList(document.querySelector('#emiSectionContentDesktop .emiList'), flaskData.emis, 'emi', 'No EMI records for this month.', emiContent);
        renderList(document.querySelector('#budgetSectionContentDesktop .budgetList'), flaskData.budgets_list, 'budget', 'No budget records for this month.', budgetContent);

        // Mobile Lists
        const mobileExpenseList = document.querySelector('#expense-content-mobile .expenseList');
        const mobileIncomeList = document.querySelector('#income-content-mobile .incomeList');
        const mobileEmiList = document.querySelector('#emi-content-mobile .emiList');
        const mobileBudgetList = document.querySelector('#budget-content-mobile .budgetList');
        renderList(mobileExpenseList, expenseData, 'expense', 'No expense records for this month.', expenseContent);
        renderList(mobileIncomeList, flaskData.income, 'income', 'No income records for this month.', incomeContent);
        renderList(mobileEmiList, flaskData.emis, 'emi', 'No EMI records for this month.', emiContent);
        renderList(mobileBudgetList, flaskData.budgets_list, 'budget', 'No budget records for this month.', budgetContent);
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

            // Update the "Currently viewing:" display
            const activeMonthDisplay = document.getElementById('desktop-active-month-display');
            if(activeMonthDisplay) activeMonthDisplay.textContent = flaskData.active_month;

            // Update dashboard titles with the new month
            const formattedMonth = new Date(flaskData.active_month + '-02').toLocaleString('default', { month: 'long', year: 'numeric' });
            document.querySelectorAll('#summary-title-desktop, #summary-title-mobile').forEach(el => el.textContent = `Summary for ${formattedMonth}`);
            document.querySelectorAll('#chart-title-desktop, #chart-title-mobile').forEach(el => el.textContent = `Budget vs. Spending for ${formattedMonth}`);
            document.querySelectorAll('#report-title-desktop, #report-title-mobile').forEach(el => el.textContent = `Budget Report for ${formattedMonth}`);

            renderAllDashboards();
            renderAllLists(expenses);
            console.log("About to update budget forms with:", flaskData.budget);
            console.log("Flask data keys:", Object.keys(flaskData));
            updateBudgetForms(flaskData.budget || {});
            await loadWeeklyBudgets(flaskData.active_month);

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
                           (exp.category || '').toLowerCase().includes(searchTerm) ||
                           (exp.payment_type || '').toLowerCase().includes(searchTerm);
                });

                // Calculate the total of filtered expenses
                const filteredTotal = filteredExpenses.reduce((total, exp) => total + parseFloat(exp.amount), 0);

                // Find the list and total span within the same view (desktop or mobile) as the search box
                const viewContainer = e.target.closest('#desktop-view, #mobile-view');
                const expenseList = viewContainer.querySelector('.expenseList');
                const searchTotalEl = viewContainer.querySelector('.searchTotal');

                // Use the same format as normal expense display (with payment type)
                const expenseSearchContent = r => {
                    const paymentType = r.payment_type ? `<span class=\"item-payment-type\" style=\"margin-left:8px;\">[${r.payment_type}]</span>` : '';
                    return `${r.date} - ${r.category} - ${r.description}${paymentType}: <b>₹${parseFloat(r.amount).toFixed(2)}</b>`;
                };
                renderList(expenseList, filteredExpenses, 'expense', 'No matching expense records.', expenseSearchContent);
                
                if (searchTotalEl) {
                    if (searchTerm) {
                        searchTotalEl.textContent = `Total: ₹${filteredTotal.toFixed(2)}`;
                    } else {
                        searchTotalEl.textContent = '';
                    }
                }
                
                toggleClearBtn();
            });
            // Initial state
            toggleClearBtn();
        });

        document.querySelectorAll('.clearExpenseSearch').forEach(clearButton => {
            clearButton.addEventListener('click', (e) => {
                const viewContainer = e.target.closest('#desktop-view, #mobile-view');
                const searchBox = viewContainer.querySelector('.expenseSearchBox');
                if(searchBox) {
                    searchBox.value = '';
                    // Manually trigger input event to re-filter, re-render, and update totals
                    searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                }
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
                    endpoint = '/api/set_budget';
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
                        let errorMessage = `Request failed with status ${response.status}.`;
                        const contentType = response.headers.get('content-type') || '';
                        if (contentType.includes('application/json')) {
                            const errorResult = await response.json();
                            errorMessage = errorResult.message || errorMessage;
                        } else {
                            const errorText = (await response.text()).trim();
                            if (errorText && !errorText.startsWith('<!DOCTYPE html') && !errorText.startsWith('<html')) {
                                errorMessage = errorText;
                            }
                        }
                        throw new Error(errorMessage);
                    }
                    let result;
                    try {
                        result = await response.json();
                    } catch (jsonErr) {
                        throw new Error('Server did not return valid JSON.');
                    }

                    if (result.status === 'success') {
                        if (form.id.startsWith('add') || action === 'setBudget') form.reset();
                        await refreshDashboardData(selectedMonth);
                        if (form.closest('#mobile-view')) {
                            switchPane('#dashboard-content-mobile', 'mobile');
                        }
                        // Show success toast
                        showToast('success', 'Success!', 'Your data has been saved successfully.');
                    } else {
                        // Show error toast
                        showToast('error', 'Error', result.message || 'Unknown error occurred.');
                    }
                } catch (error) {
                    console.error(`Form submission error for ${formId}:`, error);
                    showToast('error', 'Request Failed', getSafeErrorMessage(error, 'Failed to submit form. Please check your connection and try again.'));
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
        ['Desktop', 'Mobile'].forEach(view => {
            const form = document.getElementById(`setBudgetForm${view}`);
            if (!form) return;
            const monthInput = view === 'Desktop'
                ? document.getElementById('month_select_desktop')
                : document.getElementById('month_select_mobile');
            const monthHidden = form.querySelector('input[name="month_select"]');
            if (monthHidden && monthInput) {
                monthHidden.value = monthInput.value || flaskData.active_month;
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
                
                // Setup copy functionality
                setupCopyFunctionality();
            });
        }
    }

    // --- COPY FROM PREVIOUS MONTH FUNCTIONALITY ---
    function setupCopyFunctionality() {
        // Desktop Copy Income Button
        const copyIncomeBtn = document.getElementById('copyIncomeBtn');
        if (copyIncomeBtn) {
            copyIncomeBtn.addEventListener('click', async () => {
                await copyFromPreviousMonth('income', '/api/copy_income_from_previous');
            });
        }

        // Mobile Copy Income Button
        const copyIncomeBtnMobile = document.getElementById('copyIncomeBtnMobile');
        if (copyIncomeBtnMobile) {
            copyIncomeBtnMobile.addEventListener('click', async () => {
                await copyFromPreviousMonth('income', '/api/copy_income_from_previous');
            });
        }

        // Desktop Copy Budget Button
        const copyBudgetBtn = document.getElementById('copyBudgetBtn');
        if (copyBudgetBtn) {
            copyBudgetBtn.addEventListener('click', async () => {
                await copyFromPreviousMonth('budget', '/api/copy_budget_from_previous');
            });
        }

        // Mobile Copy Budget Button
        const copyBudgetBtnMobile = document.getElementById('copyBudgetBtnMobile');
        if (copyBudgetBtnMobile) {
            copyBudgetBtnMobile.addEventListener('click', async () => {
                await copyFromPreviousMonth('budget', '/api/copy_budget_from_previous');
            });
        }

        // Desktop Copy EMI Button
        const copyEmiBtn = document.getElementById('copyEmiBtn');
        if (copyEmiBtn) {
            copyEmiBtn.addEventListener('click', async () => {
                await copyFromPreviousMonth('emi', '/api/copy_emi_from_previous');
            });
        }

        // Mobile Copy EMI Button
        const copyEmiBtnMobile = document.getElementById('copyEmiBtnMobile');
        if (copyEmiBtnMobile) {
            copyEmiBtnMobile.addEventListener('click', async () => {
                await copyFromPreviousMonth('emi', '/api/copy_emi_from_previous');
            });
        }
    }

    async function copyFromPreviousMonth(dataType, apiEndpoint) {
        // Get current month from month selector inputs (more reliable)
        const desktopMonthSelect = document.getElementById('month_select_desktop');
        const mobileMonthSelect = document.getElementById('month_select_mobile');
        const activeMonthDisplay = document.getElementById('desktop-active-month-display');
        
        // Try multiple sources to get the current month
        let currentMonth = null;
        if (desktopMonthSelect && desktopMonthSelect.value) {
            currentMonth = desktopMonthSelect.value;
        } else if (mobileMonthSelect && mobileMonthSelect.value) {
            currentMonth = mobileMonthSelect.value;
        } else if (activeMonthDisplay && activeMonthDisplay.textContent) {
            currentMonth = activeMonthDisplay.textContent;
        }
        
        if (!currentMonth) {
            alert('Unable to determine current month');
            return;
        }

        console.log(`Copy ${dataType}: Current month detected as ${currentMonth}`);

        // Calculate previous month for display
        const currentDate = new Date(currentMonth + '-01');
        const previousDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        const previousMonth = previousDate.toISOString().slice(0, 7);

        console.log(`Copy ${dataType}: Will attempt to copy from ${previousMonth} to ${currentMonth}`);

        // Confirm action with more details
        const confirmMessage = `This will copy all ${dataType} records from ${previousMonth} to ${currentMonth} and replace any existing ${dataType} data for ${currentMonth}.\n\nNote: If ${previousMonth} has no ${dataType} data, the operation will fail.\n\nAre you sure you want to continue?`;
        if (!confirm(confirmMessage)) {
            return;
        }

        // Find both desktop and mobile buttons for this data type
        const desktopButton = document.querySelector(`#copy${dataType.charAt(0).toUpperCase() + dataType.slice(1)}Btn`);
        const mobileButton = document.querySelector(`#copy${dataType.charAt(0).toUpperCase() + dataType.slice(1)}BtnMobile`);
        
        // Disable both buttons during operation
        if (desktopButton) {
            desktopButton.disabled = true;
            desktopButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Copying...';
        }
        if (mobileButton) {
            mobileButton.disabled = true;
            mobileButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Copying...';
        }

        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    current_month: currentMonth
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                alert(result.message);
                // Refresh the dashboard to show copied data
                await refreshDashboardData(currentMonth);
            } else {
                // Show more detailed error message
                alert(`Copy Failed\n\n${result.message}\n\nTip: You can manually add ${dataType} records for the current month or copy from a month that has data.`);
            }
        } catch (error) {
            console.error(`Error copying ${dataType}:`, error);
            alert(`An error occurred while copying ${dataType} records. Please try again or add records manually.`);
        } finally {
            // Re-enable both buttons
            if (desktopButton) {
                desktopButton.disabled = false;
                desktopButton.innerHTML = `<i class="fas fa-copy"></i> Copy from Previous Month`;
            }
            if (mobileButton) {
                mobileButton.disabled = false;
                mobileButton.innerHTML = `<i class="fas fa-copy"></i> Copy`;
            }
        }
    }

    initializeApp();

    // --- FLOATING ACTION BUTTON & TOAST SYSTEM ---
    
    // Toast notification system
    function showToast(type, title, message, duration = 4000) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // Create toast content
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${getToastIcon(type)}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">
                <i class="fas fa-times"></i>
            </button>
            <div class="toast-progress"></div>
        `;

        // Add to container
        toastContainer.appendChild(toast);

        // Show toast with animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // Auto-hide toast
        const autoHideTimeout = setTimeout(() => {
            hideToast(toast);
        }, duration);

        // Handle close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            clearTimeout(autoHideTimeout);
            hideToast(toast);
        });

        // Return toast element for manual control
        return toast;
    }

    function hideToast(toast) {
        toast.classList.add('hide');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 400);
    }

    function getToastIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || 'fa-info-circle';
    }

    // FAB modal functionality
    function setupFAB() {
        const fabButton = document.getElementById('fabButton');
        const fabModalOverlay = document.getElementById('fabModalOverlay');
        const fabModalClose = document.getElementById('fabModalClose');
        const fabCancelBtn = document.getElementById('fabCancelBtn');
        const fabQuickForm = document.getElementById('fabQuickForm');
        const fabDateInput = document.getElementById('fabDate');

        if (!fabButton || !fabModalOverlay) return;

        // Set default date to today
        if (fabDateInput) {
            const today = new Date().toISOString().split('T')[0];
            fabDateInput.value = today;
        }

        // Open modal
        fabButton.addEventListener('click', () => {
            // Update month select to current active month
            const fabMonthSelect = document.getElementById('fabMonthSelect');
            const desktopMonthSelect = document.getElementById('month_select_desktop');
            const mobileMonthSelect = document.getElementById('month_select_mobile');
            
            if (fabMonthSelect) {
                const currentMonth = desktopMonthSelect?.value || mobileMonthSelect?.value || flaskData.active_month;
                fabMonthSelect.value = currentMonth;
            }

            fabModalOverlay.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        });

        // Close modal functions
        function closeFABModal() {
            fabModalOverlay.classList.remove('show');
            document.body.style.overflow = ''; // Restore scrolling
            fabQuickForm.reset();
            
            // Reset date to today
            if (fabDateInput) {
                const today = new Date().toISOString().split('T')[0];
                fabDateInput.value = today;
            }
        }

        // Close modal events
        fabModalClose.addEventListener('click', closeFABModal);
        fabCancelBtn.addEventListener('click', closeFABModal);

        // Close on overlay click
        fabModalOverlay.addEventListener('click', (e) => {
            if (e.target === fabModalOverlay) {
                closeFABModal();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && fabModalOverlay.classList.contains('show')) {
                closeFABModal();
            }
        });

        // Handle form submission
        fabQuickForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = fabQuickForm.querySelector('.fab-submit-btn');
            const originalText = submitBtn.innerHTML;
            
            // Show loading state
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
            submitBtn.disabled = true;

            try {
                const formData = new FormData(fabQuickForm);
                const response = await fetch('/api/add_expense', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    let errorMessage = `Request failed with status ${response.status}.`;
                    const contentType = response.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const errorResult = await response.json();
                        errorMessage = errorResult.message || errorMessage;
                    } else {
                        const errorText = (await response.text()).trim();
                        if (errorText && !errorText.startsWith('<!DOCTYPE html') && !errorText.startsWith('<html')) {
                            errorMessage = errorText;
                        }
                    }
                    throw new Error(errorMessage);
                }

                const result = await response.json();

                if (result.status === 'success') {
                    // Show success toast
                    showToast('success', 'Expense Added!', 'Your expense has been successfully added to the budget.');
                    
                    // Close modal
                    closeFABModal();
                    
                    // Refresh dashboard data
                    const currentMonth = formData.get('month_select');
                    await refreshDashboardData(currentMonth);
                    
                } else {
                    // Show error toast
                    showToast('error', 'Error Adding Expense', result.message || 'An error occurred while adding the expense.');
                }
            } catch (error) {
                console.error('FAB form submission error:', error);
                showToast('error', 'Request Failed', getSafeErrorMessage(error, 'Failed to add expense. Please check your connection and try again.'));
            } finally {
                // Restore button state
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Initialize FAB system
    setupFAB();

    // ---- Edit Expense Modal ----
    function setupEditExpenseModal() {
        const overlay = document.getElementById('editExpenseModalOverlay');
        const closeBtn = document.getElementById('editExpenseModalClose');
        const cancelBtn = document.getElementById('editExpenseCancelBtn');
        const form = document.getElementById('editExpenseModalForm');
        if (!overlay || !form) return;

        function closeModal() {
            overlay.classList.remove('show');
            form.reset();
        }

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('show')) closeModal();
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('editExpenseSaveBtn');
            const origText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            saveBtn.disabled = true;
            try {
                const expenseId = document.getElementById('editExpenseId').value;
                const payload = {
                    month: document.getElementById('editExpenseMonth').value,
                    date: document.getElementById('editExpenseDate').value,
                    category: document.getElementById('editExpenseCategory').value,
                    description: document.getElementById('editExpenseDescription').value,
                    amount: document.getElementById('editExpenseAmount').value,
                    payment_type: document.getElementById('editExpensePaymentType').value,
                };
                const response = await fetch(`/api/edit_expense/${expenseId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.status === 'success') {
                    showToast('success', 'Expense Updated!', 'Your expense has been updated successfully.');
                    closeModal();
                    await refreshDashboardData(flaskData.active_month);
                } else {
                    showToast('error', 'Update Failed', result.message || 'Failed to update expense.');
                }
            } catch (error) {
                console.error('Edit expense error:', error);
                showToast('error', 'Request Failed', getSafeErrorMessage(error, 'Failed to update expense. Please try again.'));
            } finally {
                saveBtn.innerHTML = origText;
                saveBtn.disabled = false;
            }
        });
    }

    async function openEditExpenseModal(expenseId) {
        const overlay = document.getElementById('editExpenseModalOverlay');
        if (!overlay) return;
        try {
            const response = await fetch(`/api/edit_expense/${expenseId}`);
            const result = await response.json();
            if (result.status !== 'success') {
                showToast('error', 'Error', result.message || 'Could not load expense details.');
                return;
            }
            const exp = result.expense;
            document.getElementById('editExpenseId').value = exp.id;
            document.getElementById('editExpenseMonth').value = exp.month || flaskData.active_month;
            document.getElementById('editExpenseDate').value = exp.date || '';
            document.getElementById('editExpenseCategory').value = exp.category || '';
            document.getElementById('editExpenseDescription').value = exp.description || '';
            document.getElementById('editExpenseAmount').value = exp.amount || '';
            document.getElementById('editExpensePaymentType').value = exp.payment_type || '';
            overlay.classList.add('show');
        } catch (error) {
            console.error('Failed to load expense:', error);
            showToast('error', 'Network Error', 'Could not load expense details. Please try again.');
        }
    }

    setupEditExpenseModal();

    // Replace existing alert calls with toast notifications for better UX
    function enhanceExistingAlerts() {
        // Override window.alert for success/error messages (optional)
        const originalAlert = window.alert;
        window.showSuccessToast = (message) => showToast('success', 'Success', message);
        window.showErrorToast = (message) => showToast('error', 'Error', message);
        window.showInfoToast = (message) => showToast('info', 'Info', message);
        window.showWarningToast = (message) => showToast('warning', 'Warning', message);
    }

    enhanceExistingAlerts();

    // Setup datalist inputs to show all options on focus
    setupDatalistInputs();

    // --- WEEKLY BUDGET FUNCTIONS ---
    let selectedWeeklyViewIndex = null;
    let weeklyBudgetsCache = [];
    function getFormattedCurrency(value) {
        return `₹${parseFloat(value || 0).toFixed(2)}`;
    }

    function getMonthlyBudgetFromWeeks(weeks) {
        if (!weeks || weeks.length === 0) return '';
        const monthlyTotal = weeks.reduce((total, week) => total + parseFloat(week.base_budget || 0), 0);
        return monthlyTotal.toFixed(2);
    }

    function syncWeeklyBudgetInputs(value) {
        const desktopInput = document.getElementById('weeklyBudgetAmountAll');
        const mobileInput = document.getElementById('weeklyBudgetAmountAllMobile');
        if (desktopInput) desktopInput.value = value;
        if (mobileInput) mobileInput.value = value;
    }

    function applyWeeklySelectedCategories(selectedCategories) {
        const selectedSet = new Set((selectedCategories || []).map(category => (category || '').toString().trim()).filter(Boolean));
        ['weeklyBudgetCategoriesAll', 'weeklyBudgetCategoriesAllMobile'].forEach(containerId => {
            const categoryContainer = document.getElementById(containerId);
            if (!categoryContainer) return;

            const checkboxes = categoryContainer.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = selectedSet.has((checkbox.value || '').toString().trim());
            });
        });
    }

    function getSelectedWeeklyCategories(containerId) {
        const categoryContainer = document.getElementById(containerId);
        return Array.from(categoryContainer?.querySelectorAll('input[type="checkbox"]:checked') || [])
            .map(checkbox => checkbox.value);
    }

    function bindWeeklyCategorySync() {
        const syncFromContainer = (sourceId) => {
            const selectedCategories = getSelectedWeeklyCategories(sourceId);
            applyWeeklySelectedCategories(selectedCategories);
        };

        ['weeklyBudgetCategoriesAll', 'weeklyBudgetCategoriesAllMobile'].forEach(containerId => {
            const container = document.getElementById(containerId);
            if (!container) return;

            container.addEventListener('change', (event) => {
                const target = event.target;
                if (target && target.matches('input[type="checkbox"]')) {
                    syncFromContainer(containerId);
                }
            });
        });
    }

    function getActiveWeekForMonth(weeks, month) {
        if (!weeks || weeks.length === 0) return null;

        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

        if (month === currentMonth) {
            const todayString = today.toISOString().slice(0, 10);
            const currentWeek = weeks.find(week => week.week_start <= todayString && todayString <= week.week_end);
            if (currentWeek) return currentWeek;
        }

        const firstWeekWithSpend = weeks.find(week => parseFloat(week.spent || 0) > 0);
        return firstWeekWithSpend || weeks[0];
    }

    async function loadWeeklyBudgets(month) {
        const containers = [
            { container: document.getElementById('weeklyBudgetContainer'), singleView: document.getElementById('weeklyBudgetSingleView'), loading: document.getElementById('weeklyBudgetLoading') },
            { container: document.getElementById('weeklyBudgetContainerMobile'), singleView: document.getElementById('weeklyBudgetSingleViewMobile'), loading: document.getElementById('weeklyBudgetLoadingMobile') }
        ];

        if (!month) return;

        containers.forEach(({ container, loading }) => {
            if (loading) { loading.style.display = 'block'; loading.textContent = 'Loading weekly budget data...'; }
            if (container) container.style.display = 'none';
        });

        try {
            const response = await fetch(`/api/weekly_budget?month=${encodeURIComponent(month)}`);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();

            if (data.status === 'success') {
                weeklyBudgetsCache = data.weekly_budgets || [];
                applyWeeklySelectedCategories(data.selected_categories || []);
                renderWeeklyBudgets(weeklyBudgetsCache);
            } else {
                containers.forEach(({ container, singleView, loading }) => {
                    if (container) container.style.display = 'block';
                    if (singleView) singleView.innerHTML = '<div style="padding: 10px; color: #b91c1c;">Weekly budget data is unavailable right now.</div>';
                    if (loading) loading.textContent = 'Could not load weekly budget data.';
                });
                showToast('error', 'Error', data.message || 'Failed to load weekly budgets.');
            }
        } catch (error) {
            console.error('Failed to load weekly budgets:', error);
            containers.forEach(({ container, singleView, loading }) => {
                if (container) container.style.display = 'block';
                if (singleView) singleView.innerHTML = '<div style="padding: 10px; color: #b91c1c;">Weekly budget data could not be fetched. Please refresh the page.</div>';
                if (loading) loading.textContent = 'Could not load weekly budget data.';
            });
            showToast('error', 'Network Error', 'Could not load weekly budgets. Please try again.');
        }
    }

    function renderWeeklyBudgets(weeks) {
        const panels = [
            {
                container: document.getElementById('weeklyBudgetContainer'),
                singleView: document.getElementById('weeklyBudgetSingleView'),
                loading: document.getElementById('weeklyBudgetLoading'),
                amountInput: document.getElementById('weeklyBudgetAmountAll'),
                currentWeekLabel: document.getElementById('weeklyCurrentLabel'),
                prevBtn: document.getElementById('weeklyPrevBtn'),
                nextBtn: document.getElementById('weeklyNextBtn'),
            },
            {
                container: document.getElementById('weeklyBudgetContainerMobile'),
                singleView: document.getElementById('weeklyBudgetSingleViewMobile'),
                loading: document.getElementById('weeklyBudgetLoadingMobile'),
                amountInput: document.getElementById('weeklyBudgetAmountAllMobile'),
                currentWeekLabel: document.getElementById('weeklyCurrentLabelMobile'),
                prevBtn: document.getElementById('weeklyPrevBtnMobile'),
                nextBtn: document.getElementById('weeklyNextBtnMobile'),
            }
        ];

        panels.forEach(({ container, singleView, loading, amountInput, currentWeekLabel, prevBtn, nextBtn }) => {
            if (!container || !singleView) return;

            if (loading) loading.style.display = 'none';
            singleView.innerHTML = '';

            if (!weeks || weeks.length === 0) {
                singleView.innerHTML = '<div style="padding: 10px; color: #666;">No weekly budget data available.</div>';
                container.style.display = 'block';
                return;
            }

            if (amountInput) {
                amountInput.value = getMonthlyBudgetFromWeeks(weeks);
            }

            syncWeeklyBudgetInputs(getMonthlyBudgetFromWeeks(weeks));

            if (selectedWeeklyViewIndex === null || selectedWeeklyViewIndex < 0 || selectedWeeklyViewIndex >= weeks.length) {
                selectedWeeklyViewIndex = 0;
            }

            const weekToRender = weeks[selectedWeeklyViewIndex];
            if (!weekToRender) {
                singleView.innerHTML = '<div style="padding: 10px; color: #666;">No active week available.</div>';
                container.style.display = 'block';
                return;
            }

            // Only show actual values if categories have been distributed;
            // otherwise show 0 so the user knows they need to select and distribute first.
            const hasCategoryFilter = Array.isArray(weekToRender.selected_categories)
                ? weekToRender.selected_categories.length > 0
                : (weekToRender.selected_categories || '').length > 0;

            const displaySpent    = hasCategoryFilter ? parseFloat(weekToRender.spent   || 0) : 0;
            const remaining       = hasCategoryFilter ? parseFloat(weekToRender.variance || 0) : 0;
            const remainingColor  = remaining >= 0 ? '#166534' : '#b91c1c';
            const remainingBg     = remaining >= 0 ? '#dcfce7' : '#fee2e2';

            if (currentWeekLabel) currentWeekLabel.textContent = `Week ${weekToRender.week_index}`;
            if (prevBtn) prevBtn.disabled = selectedWeeklyViewIndex === 0;
            if (nextBtn) nextBtn.disabled = selectedWeeklyViewIndex === weeks.length - 1;

            const statusClass = !hasCategoryFilter ? 'week-status-safe'
                : (remaining >= 0 ? 'week-status-safe' : 'week-status-over');
            const statusLabel = !hasCategoryFilter ? 'Not Set'
                : (remaining >= 0 ? 'On Track' : 'Over Budget');

            singleView.innerHTML = `
                <div class="weekly-budget-card">
                    <div class="weekly-budget-card-header">
                        <div>
                            <div class="weekly-budget-card-title">Week ${weekToRender.week_index}</div>
                            <div class="weekly-budget-card-range">${getWeekDateRange(weekToRender.week_start, weekToRender.week_end)}</div>
                        </div>
                        <div class="weekly-budget-status ${statusClass}">${statusLabel}</div>
                    </div>
                    <div class="weekly-budget-metrics">
                        <div class="weekly-budget-metric spent">
                            <div class="weekly-budget-metric-label">Spent This Week</div>
                            <div class="weekly-budget-metric-value">${getFormattedCurrency(displaySpent)}</div>
                        </div>
                        <div class="weekly-budget-metric remaining" style="--metric-bg: ${remainingBg}; --metric-color: ${remainingColor};">
                            <div class="weekly-budget-metric-label">Remaining This Week</div>
                            <div class="weekly-budget-metric-value">${getFormattedCurrency(remaining)}</div>
                        </div>
                    </div>
                </div>
            `;

            container.style.display = 'block';
        });
    }

    function getWeekDateRange(startDate, endDate) {
        if (!startDate || !endDate) return 'Date Range TBD';
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const startStr = start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
            const endStr = end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
            return `${startStr} - ${endStr}`;
        } catch (e) {
            return `${startDate} - ${endDate}`;
        }
    }

    async function setWeeklyBaseBudget(weekIndex, baseBudget) {
        try {
            const response = await fetch('/api/weekly_budget/set', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    week_index: weekIndex,
                    base_budget: baseBudget,
                    month: flaskData.active_month
                })
            });

            const result = await response.json();
            if (result.status === 'success') {
                showToast('success', 'Updated', `Week ${weekIndex} budget updated successfully.`);
                // Reload weekly budgets
                await loadWeeklyBudgets(flaskData.active_month);
            } else {
                showToast('error', 'Error', result.message || 'Failed to update budget.');
            }
        } catch (error) {
            console.error('Failed to set weekly budget:', error);
            showToast('error', 'Network Error', 'Could not update budget. Please try again.');
        }
    }

    async function setAllWeeklyBaseBudget(selectedCategories) {
        try {
            const response = await fetch('/api/weekly_budget/set_all', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    selected_categories: selectedCategories,
                    month: flaskData.active_month
                })
            });

            const result = await response.json();
            if (result.status === 'success') {
                showToast('success', 'Updated', result.message || 'Weekly budget distributed across weeks.');
                // Re-apply the same categories that were just submitted so checkboxes
                // stay checked after the API reload re-renders the container.
                const justSelected = selectedCategories.slice();
                await loadWeeklyBudgets(flaskData.active_month);
                applyWeeklySelectedCategories(justSelected);
            } else {
                showToast('error', 'Error', result.message || 'Failed to distribute weekly budget.');
            }
        } catch (error) {
            console.error('Failed to set all weekly budgets:', error);
            showToast('error', 'Network Error', 'Could not distribute weekly budget. Please try again.');
        }
    }

    const weeklyBudgetApplyAllBtn = document.getElementById('weeklyBudgetApplyAllBtn');
    if (weeklyBudgetApplyAllBtn) {
        weeklyBudgetApplyAllBtn.addEventListener('click', async () => {
            const selectedCategories = getSelectedWeeklyCategories('weeklyBudgetCategoriesAll');

            if (selectedCategories.length === 0) {
                showToast('warning', 'No Categories', 'Please select at least one category to track.');
                return;
            }

            await setAllWeeklyBaseBudget(selectedCategories);
        });
    }

    // Populate category checkboxes from flaskData only when non-empty.
    // If empty, keep the server-rendered fallback checkboxes intact.
    const categoryContainer = document.getElementById('weeklyBudgetCategoriesAll');
    const categoryContainerMobile = document.getElementById('weeklyBudgetCategoriesAllMobile');
    const categoryOptions = Array.isArray(flaskData.category_options)
        ? flaskData.category_options.filter(category => (category || '').toString().trim() !== '')
        : [];

    const renderCategoryCheckboxes = (containerElement) => {
        if (!containerElement) return;
        containerElement.innerHTML = '';
        categoryOptions.forEach(category => {
            const label = document.createElement('label');
            label.className = 'weekly-budget-checkbox-label';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = category;
            checkbox.className = 'weekly-budget-checkbox';

            const textSpan = document.createElement('span');
            textSpan.textContent = category;

            label.appendChild(checkbox);
            label.appendChild(textSpan);
            containerElement.appendChild(label);
        });
    };

    if (categoryOptions.length > 0) {
        renderCategoryCheckboxes(categoryContainer);
        renderCategoryCheckboxes(categoryContainerMobile);
    }

    bindWeeklyCategorySync();

    const weeklyPrevBtn = document.getElementById('weeklyPrevBtn');
    if (weeklyPrevBtn) {
        weeklyPrevBtn.addEventListener('click', () => {
            selectedWeeklyViewIndex = Math.max(0, (selectedWeeklyViewIndex ?? 0) - 1);
            renderWeeklyBudgets(weeklyBudgetsCache);
        });
    }

    const weeklyNextBtn = document.getElementById('weeklyNextBtn');
    if (weeklyNextBtn) {
        weeklyNextBtn.addEventListener('click', () => {
            selectedWeeklyViewIndex = Math.min((weeklyBudgetsCache.length || 1) - 1, (selectedWeeklyViewIndex ?? 0) + 1);
            renderWeeklyBudgets(weeklyBudgetsCache);
        });
    }

    // Mobile Weekly Budget Controls
    const weeklyBudgetApplyAllBtnMobile = document.getElementById('weeklyBudgetApplyAllBtnMobile');
    if (weeklyBudgetApplyAllBtnMobile) {
        weeklyBudgetApplyAllBtnMobile.addEventListener('click', async () => {
            const selectedCategories = getSelectedWeeklyCategories('weeklyBudgetCategoriesAllMobile');

            if (selectedCategories.length === 0) {
                showToast('warning', 'No Categories', 'Please select at least one category to track.');
                return;
            }
            await setAllWeeklyBaseBudget(selectedCategories);
        });
    }

    const weeklyPrevBtnMobile = document.getElementById('weeklyPrevBtnMobile');
    if (weeklyPrevBtnMobile) {
        weeklyPrevBtnMobile.addEventListener('click', () => {
            selectedWeeklyViewIndex = Math.max(0, (selectedWeeklyViewIndex ?? 0) - 1);
            renderWeeklyBudgets(weeklyBudgetsCache);
        });
    }

    const weeklyNextBtnMobile = document.getElementById('weeklyNextBtnMobile');
    if (weeklyNextBtnMobile) {
        weeklyNextBtnMobile.addEventListener('click', () => {
            selectedWeeklyViewIndex = Math.min((weeklyBudgetsCache.length || 1) - 1, (selectedWeeklyViewIndex ?? 0) + 1);
            renderWeeklyBudgets(weeklyBudgetsCache);
        });
    }

});
