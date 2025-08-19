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
                        { 
                            label: 'Budgeted', 
                            data: data.budget_values, 
                            backgroundColor: 'rgba(30, 64, 175, 0.8)',
                            borderColor: 'rgba(30, 64, 175, 1)',
                            borderWidth: 2,
                            borderRadius: 8,
                            borderSkipped: false,
                            hoverBackgroundColor: 'rgba(59, 130, 246, 0.9)',
                            hoverBorderColor: 'rgba(59, 130, 246, 1)',
                            hoverBorderWidth: 3
                        },
                        { 
                            label: 'Spent', 
                            data: data.spent_values, 
                            backgroundColor: 'rgba(96, 165, 250, 0.8)',
                            borderColor: 'rgba(96, 165, 250, 1)',
                            borderWidth: 2,
                            borderRadius: 8,
                            borderSkipped: false,
                            hoverBackgroundColor: 'rgba(147, 197, 253, 0.9)',
                            hoverBorderColor: 'rgba(147, 197, 253, 1)',
                            hoverBorderWidth: 3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { 
                        y: { 
                            beginAtZero: true, 
                            ticks: { 
                                stepSize: 4000,
                                color: 'rgba(71, 85, 105, 0.8)',
                                font: {
                                    weight: 'normal'
                                }
                            },
                            grid: {
                                color: 'rgba(71, 85, 105, 0.1)',
                                lineWidth: 1
                            },
                            border: {
                                color: 'rgba(30, 64, 175, 0.3)',
                                width: 2
                            }
                        },
                        x: {
                            ticks: {
                                color: 'rgba(71, 85, 105, 0.8)',
                                font: {
                                    weight: 'normal'
                                }
                            },
                            grid: {
                                color: 'rgba(71, 85, 105, 0.1)',
                                lineWidth: 1
                            },
                            border: {
                                color: 'rgba(30, 64, 175, 0.3)',
                                width: 2
                            }
                        }
                    },
                    plugins: { 
                        legend: { 
                            position: 'top',
                            labels: {
                                color: 'rgba(71, 85, 105, 0.9)',
                                font: {
                                    size: 14,
                                    weight: 'normal'
                                },
                                padding: 20,
                                usePointStyle: true,
                                pointStyle: 'rectRounded'
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(30, 64, 175, 0.95)',
                            titleColor: 'rgba(255, 255, 255, 1)',
                            bodyColor: 'rgba(255, 255, 255, 0.9)',
                            borderColor: 'rgba(59, 130, 246, 1)',
                            borderWidth: 2,
                            cornerRadius: 12,
                            displayColors: true,
                            titleFont: {
                                weight: 'normal'
                            },
                            bodyFont: {
                                weight: 'normal'
                            }
                        }
                    },
                    animation: {
                        duration: 1200,
                        easing: 'easeOutCubic'
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
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
                        // Show success toast
                        showToast('success', 'Success!', 'Your data has been saved successfully.');
                    } else {
                        // Show error toast
                        showToast('error', 'Error', result.message || 'Unknown error occurred.');
                    }
                } catch (error) {
                    console.error(`Form submission error for ${formId}:`, error);
                    showToast('error', 'Network Error', 'Failed to submit form. Please check your connection and try again.');
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
        console.log("Budget data type:", typeof budgetData);
        console.log("Budget data keys:", Object.keys(budgetData));
        const categories = ['Food', 'Cloth', 'Online', 'Miscellaneous', 'Other'];

        // Update both desktop and mobile forms
        ['Desktop', 'Mobile'].forEach(view => {
            const form = document.getElementById(`setBudgetForm${view}`);
            if (form) {
                console.log(`Processing form: setBudgetForm${view}`);
                categories.forEach(category => {
                    const input = form.querySelector(`input[name="${category}"]`);
                    if (input) {
                        console.log(`Category: ${category}, Current value: "${input.value}", Budget data value:`, budgetData[category]);
                        // Clear the input and set only if there's valid budget data
                        input.value = ''; // Always clear first
                        if (budgetData[category] !== undefined && budgetData[category] !== null && budgetData[category] !== 0 && budgetData[category] !== '0') {
                            const budgetValue = parseFloat(budgetData[category]);
                            if (!isNaN(budgetValue) && budgetValue > 0) {
                                input.value = budgetValue;
                                console.log(`Set ${category} to: ${budgetValue}`);
                            } else {
                                console.log(`Leaving ${category} empty (invalid value: ${budgetData[category]})`);
                            }
                        } else {
                            console.log(`Leaving ${category} empty (no data or zero value)`);
                        }
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
                
                // Setup copy functionality
                setupCopyFunctionality();
            });

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
                showToast('error', 'Network Error', 'Failed to add expense. Please check your connection and try again.');
            } finally {
                // Restore button state
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Initialize FAB system
    setupFAB();

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
});
