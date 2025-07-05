document.addEventListener('DOMContentLoaded', function () {
    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Function to switch tabs
    function switchTab(targetId) {
        tabPanes.forEach(pane => {
            if (pane.id === targetId.substring(1)) { // Remove # for ID comparison
                pane.classList.add('active');
                pane.style.display = 'block'; // Show active pane
            } else {
                pane.classList.remove('active');
                pane.style.display = 'none'; // Hide inactive panes
            }
        });

        tabButtons.forEach(button => {
            if (button.dataset.target === targetId) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    // Add click event listeners to tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            const targetId = this.dataset.target;
            switchTab(targetId);
        });
    });

    // Ensure the initially active tab pane is displayed
    // This relies on the 'active' class being set in the HTML for the default tab and pane
    const initiallyActivePane = document.querySelector('.tab-pane.active');
    if (initiallyActivePane) {
        initiallyActivePane.style.display = 'block';
    } else {
        // If no tab is marked active in HTML, default to the first one
        if (tabButtons.length > 0 && tabPanes.length > 0) {
            // Activate the first button and its corresponding pane
            const firstButtonTarget = tabButtons[0].dataset.target;
            switchTab(firstButtonTarget); 
        }
    }

    // Initialize flaskData with a comprehensive default structure
    let flaskData = {
        income: [],
        expenses: [],
        emis: [],
        budget: {},
        active_month_total_budget: 0,
        active_month_total_spent: 0,
        doughnut_chart_labels: [],
        doughnut_chart_values: [],
        chart_spent_values: []
    };

    const flaskDataElement = document.getElementById('flaskData');
    // Check if the element exists and its textContent is not null, undefined, or just whitespace
    if (flaskDataElement && flaskDataElement.textContent && flaskDataElement.textContent.trim() !== '') {
        try {
            const parsedData = JSON.parse(flaskDataElement.textContent);
            // Merge parsedData into the existing flaskData object
            for (const key in parsedData) {
                if (Object.prototype.hasOwnProperty.call(parsedData, key)) {
                    flaskData[key] = parsedData[key];
                }
            }
        } catch (error) {
            console.error("Error parsing Flask data:", error, "Using default data structure.");
            // flaskData already holds the default structure
        }
    } else {
        console.warn("Flask data element not found or its content is empty. Using default data structure.");
        // flaskData already initialized with defaults.
    }

    // Log the fully parsed flaskData object
    console.log("Parsed Flask Data from script.js:", JSON.stringify(flaskData, null, 2));

    // Directly use properties from the flaskData object
    const income = flaskData.income || [];
    const expenses = flaskData.expenses || [];
    const emis = flaskData.emis || [];
    const budget = flaskData.budget || {};
    // Note: active_month_total_budget and active_month_total_spent are in flaskData
    // but not assigned to separate const here. They might be used directly or by calculateTotals.
    const categoryLabels = flaskData.doughnut_chart_labels || [];
    const budgetedValuesByCategory = flaskData.doughnut_chart_values || [];
    const spentValuesByCategory = flaskData.chart_spent_values || [];

    // Log the key data arrays/objects that will be used by functions
    console.log("Income data for processing:", JSON.stringify(income, null, 2));
    console.log("Expenses data for processing:", JSON.stringify(expenses, null, 2));
    console.log("EMIs data for processing:", JSON.stringify(emis, null, 2));
    console.log("Budget data for processing:", JSON.stringify(budget, null, 2));
    console.log("Category Labels for chart:", JSON.stringify(categoryLabels, null, 2));
    console.log("Budgeted Values for chart:", JSON.stringify(budgetedValuesByCategory, null, 2));
    console.log("Spent Values for chart:", JSON.stringify(spentValuesByCategory, null, 2));

    function calculateTotals() {
        let totalIncome = 0;
        (income || []).forEach(item => totalIncome += parseFloat(item.amount || 0));

        let totalExpenses = 0;
        (expenses || []).forEach(item => totalExpenses += parseFloat(item.amount || 0));

        let totalEMI = 0;
        (emis || []).forEach(item => totalEMI += parseFloat(item.emi_amount || 0));

        // Calculate total budget from the budget object
        let totalBudget = 0;
        if (budget && typeof budget === 'object') {
            Object.values(budget).forEach(val => totalBudget += parseFloat(val || 0));
        }

        const remainingBudget = totalBudget - totalExpenses;
        const netSavings = totalIncome - (totalExpenses + totalEMI);

        // Update summary display
        const totalIncomeEl = document.getElementById('totalIncome');
        const totalExpensesEl = document.getElementById('totalExpenses');
        const totalEMIEl = document.getElementById('totalEMI');
        const remainingBudgetEl = document.getElementById('remainingBudget');
        const netSavingsEl = document.getElementById('netSavings');

        if (totalIncomeEl) totalIncomeEl.textContent = totalIncome.toFixed(2);
        if (totalExpensesEl) totalExpensesEl.textContent = totalExpenses.toFixed(2);
        if (totalEMIEl) totalEMIEl.textContent = totalEMI.toFixed(2);

        if (remainingBudgetEl) {
            remainingBudgetEl.textContent = remainingBudget.toFixed(2);
            remainingBudgetEl.style.color = remainingBudget < 0 ? 'red' : 'green';
        }

        if (netSavingsEl) {
            netSavingsEl.textContent = netSavings.toFixed(2);
            netSavingsEl.style.color = netSavings < 0 ? 'red' : 'green';
        }
    }

    function populateBudgetReportTable() {
        const tableBody = document.querySelector('#budgetReportTable tbody');
        const tableFoot = document.querySelector('#budgetReportTable tfoot');
        if (!tableBody || !tableFoot) return;

        tableBody.innerHTML = ''; // Clear existing rows
        tableFoot.innerHTML = ''; // Clear existing footer

        let overallBudgeted = 0;
        let overallSpent = 0;

        // Use categoryLabels from flaskData to ensure all defined categories are included
        // and maintain a consistent order.
        (categoryLabels || []).forEach(category => {
            const budgetedAmount = parseFloat(budget[category] || 0);
            
            // Calculate spent amount for this category from expenses list
            let spentAmount = 0;
            (expenses || []).forEach(expense => {
                if (expense.category === category) {
                    spentAmount += parseFloat(expense.amount || 0);
                }
            });

            const difference = budgetedAmount - spentAmount;

            overallBudgeted += budgetedAmount;
            overallSpent += spentAmount;

            const row = tableBody.insertRow();
            row.insertCell().textContent = category;
            row.insertCell().textContent = budgetedAmount.toFixed(2);
            row.insertCell().textContent = spentAmount.toFixed(2);
            const differenceCell = row.insertCell();
            differenceCell.textContent = difference.toFixed(2);
            differenceCell.style.color = difference < 0 ? 'red' : 'green';
        });

        // Add overall summary row to tfoot
        const footerRow = tableFoot.insertRow();
        footerRow.style.fontWeight = 'bold';
        footerRow.insertCell().textContent = 'Overall Total';
        footerRow.insertCell().textContent = overallBudgeted.toFixed(2);
        footerRow.insertCell().textContent = overallSpent.toFixed(2);
        const overallDifferenceCell = footerRow.insertCell();
        const overallDifference = overallBudgeted - overallSpent;
        overallDifferenceCell.textContent = overallDifference.toFixed(2);
        overallDifferenceCell.style.color = overallDifference < 0 ? 'red' : 'green';
    }

    function renderCategoryBarChart() {
        const ctx = document.getElementById('categoryBarChart')?.getContext('2d');
        if (!ctx) {
            console.error('Failed to get canvas context for categoryBarChart');
            return;
        }

        // Destroy existing chart instance if it exists
        if (window.myCategoryBarChart instanceof Chart) {
            window.myCategoryBarChart.destroy();
        }

        // Ensure data arrays are available
        const labels = categoryLabels || [];
        const budgetedData = budgetedValuesByCategory || [];
        const spentData = spentValuesByCategory || [];

        window.myCategoryBarChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Budgeted Amount',
                        data: budgetedData,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)', // Blue
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1,
                        barPercentage: 0.5, // Make bars thinner
                        categoryPercentage: 0.7 // Adjust space for category group
                    },
                    {
                        label: 'Spent Amount',
                        data: spentData,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)', // Red
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1,
                        barPercentage: 0.5, // Make bars thinner
                        categoryPercentage: 0.7 // Adjust space for category group
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Important for controlling height with CSS
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₹' + value;
                            },
                            maxTicksLimit: 6 // Suggests around 5 intervals/rows on y-axis
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45, // Rotate labels if they overlap
                            minRotation: 0
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += '₹' + context.parsed.y.toFixed(2);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    // Initial calculations and rendering
    calculateTotals();
    populateBudgetReportTable();
    renderCategoryBarChart();

    // --- Logic for Add Expense Form (on index.html) ---
    // Ensures the hidden description field is populated correctly before submission
    const addExpenseForm = document.querySelector('form[action="/add_expense"]');
    if (addExpenseForm) {
        const displayDescInputAdd = addExpenseForm.querySelector('#expense_description_display');
        const hiddenDescInputAdd = addExpenseForm.querySelector('#expense_description');

        // Default RBL for radio buttons is handled by 'checked' in HTML.

        addExpenseForm.addEventListener('submit', function(event) {
            const selectedPaymentTypeRadio = addExpenseForm.querySelector('input[name="payment_type"]:checked');
            
            if (displayDescInputAdd && hiddenDescInputAdd) {
                let description = displayDescInputAdd.value.trim();
                const paymentType = selectedPaymentTypeRadio ? selectedPaymentTypeRadio.value : ""; 

                if (paymentType) { 
                    description += ` (${paymentType})`;
                }
                hiddenDescInputAdd.value = description;
                console.log('[ADD EXPENSE SUBMIT] Combined description: "' + hiddenDescInputAdd.value + '"');
            } else {
                console.error('[ADD EXPENSE SUBMIT] Critical form elements missing for description combination.');
            }
        });
    }

    // --- Logic for Edit Expense Form (on edit_item.html) ---
    const editExpenseForm = document.getElementById('editExpenseFormHtml'); // Changed selector to use ID
    if (editExpenseForm) {
        const displayDescInputEdit = editExpenseForm.querySelector('#expense_description_display_edit');
        const hiddenDescInputEdit = editExpenseForm.querySelector('#expense_description_edit');
        // const paymentTypeSelectEdit = editExpenseForm.querySelector('#expense_payment_type_edit'); // No longer a select

        // Function to parse description and set payment type for edit page
        function parseDescriptionForEditPage() {
            console.log("Attempting to parse description for edit page...");
            if (hiddenDescInputEdit && displayDescInputEdit) {
                const fullDescription = hiddenDescInputEdit.value;
                console.log("Full description from hidden field (item.description):", fullDescription);

                let actualDescription = fullDescription;
                let paymentType = "";

                const paymentKeywords = ["(Amex)", "(RBL)", "(CASH)"];
                for (const keyword of paymentKeywords) {
                    if (fullDescription.endsWith(keyword)) {
                        paymentType = keyword.substring(1, keyword.length - 1);
                        actualDescription = fullDescription.substring(0, fullDescription.length - keyword.length).trim();
                        console.log(`Found payment type: ${paymentType}, Actual description: ${actualDescription}`);
                        break;
                    }
                }
                displayDescInputEdit.value = actualDescription;
                console.log("Set display description to:", actualDescription);

                const paymentRadios = editExpenseForm.querySelectorAll('input[name="payment_type_edit"]');
                let foundRadio = false;
                paymentRadios.forEach(radio => {
                    if (radio.value.toUpperCase() === paymentType.toUpperCase()) {
                        radio.checked = true;
                        foundRadio = true;
                        console.log("Checked radio button for payment type:", paymentType);
                    } else {
                        radio.checked = false;
                    }
                });
                if (!foundRadio && paymentType) {
                    console.warn("Could not find a radio button for payment type:", paymentType);
                } else if (!paymentType) {
                    console.log("No payment type found in description, all payment radios unchecked.");
                }

            } else {
                console.error("Required input fields for parsing description not found on edit page.");
                if (!hiddenDescInputEdit) console.error("Hidden description field (expense_description_edit) not found.");
                if (!displayDescInputEdit) console.error("Display description field (expense_description_display_edit) not found.");
            }
        }

        // Call the function on page load to populate the fields
        parseDescriptionForEditPage();

        // Update hidden description on form submit
        editExpenseForm.addEventListener('submit', function(event) {
            const selectedPaymentRadioEdit = editExpenseForm.querySelector('input[name="payment_type_edit"]:checked');
            if (displayDescInputEdit && hiddenDescInputEdit) {
                let description = displayDescInputEdit.value.trim();
                const paymentType = selectedPaymentRadioEdit ? selectedPaymentRadioEdit.value : "";

                if (paymentType) {
                    hiddenDescInputEdit.value = `${description} (${paymentType})`;
                } else {
                    hiddenDescInputEdit.value = description;
                }
            }
        });
    }

    // --- Payment Type Totals Block Logic ---
    function updatePaymentTypeTotals() {
        let totalAmex = 0, totalRbl = 0, totalCash = 0;
        (expenses || []).forEach(exp => {
            // Try to extract payment type from description (e.g., "... (Amex)")
            let paymentType = '';
            if (exp.description && typeof exp.description === 'string') {
                const match = exp.description.match(/\((Amex|RBL|CASH)\)$/i);
                if (match) {
                    paymentType = match[1].toUpperCase();
                }
            }
            // Fallback: If there's a payment_type field, use it (future-proofing)
            if (!paymentType && exp.payment_type) {
                paymentType = exp.payment_type.toUpperCase();
            }
            const amt = parseFloat(exp.amount || 0);
            if (paymentType === 'AMEX') totalAmex += amt;
            else if (paymentType === 'RBL') totalRbl += amt;
            else if (paymentType === 'CASH') totalCash += amt;
        });
        const amexEl = document.getElementById('totalAmex');
        const rblEl = document.getElementById('totalRbl');
        const cashEl = document.getElementById('totalCash');
        if (amexEl) amexEl.textContent = totalAmex.toFixed(2);
        if (rblEl) rblEl.textContent = totalRbl.toFixed(2);
        if (cashEl) cashEl.textContent = totalCash.toFixed(2);
    }
    updatePaymentTypeTotals();

    // --- Expense Search Box Logic ---
    const expenseSearchBox = document.getElementById('expenseSearchBox');
    const expenseList = document.getElementById('expenseList');
    const searchTotal = document.getElementById('searchTotal');
    const clearExpenseSearch = document.getElementById('clearExpenseSearch');

    // Store the original list items for reset
    let originalExpenseItems = [];
    if (expenseList) {
        originalExpenseItems = Array.from(expenseList.querySelectorAll('li'));
    }

    function filterExpenses() {
        const searchTerm = (expenseSearchBox.value || '').toLowerCase();
        let total = 0;
        let anyMatch = false;
        expenseList.innerHTML = '';
        (expenses || []).forEach((exp, idx) => {
            const desc = (exp.description || '').toLowerCase();
            const cat = (exp.category || '').toLowerCase();
            if (searchTerm === '' || desc.includes(searchTerm) || cat.includes(searchTerm)) {
                // Find the corresponding <li> by index (assumes order matches)
                if (originalExpenseItems[idx]) {
                    expenseList.appendChild(originalExpenseItems[idx].cloneNode(true));
                }
                total += parseFloat(exp.amount || 0);
                anyMatch = true;
            }
        });
        if (!anyMatch) {
            const li = document.createElement('li');
            li.textContent = 'No matching expense records.';
            expenseList.appendChild(li);
        }
        if (searchTerm) {
            searchTotal.textContent = `Total: ₹${total.toFixed(2)}`;
        } else {
            searchTotal.textContent = '';
        }
    }

    if (expenseSearchBox && expenseList) {
        expenseSearchBox.addEventListener('input', filterExpenses);
    }
    if (clearExpenseSearch && expenseSearchBox) {
        clearExpenseSearch.addEventListener('click', function() {
            expenseSearchBox.value = '';
            filterExpenses();
            expenseSearchBox.focus();
        });
    }

    function initializeMobileView() {
        const navItems = document.querySelectorAll('.nav-item');
        const fab = document.getElementById('fab-add-expense');
        const modal = document.getElementById('add-expense-modal');
        const closeModalBtn = document.getElementById('close-modal-button');
        const expenseForm = document.querySelector('form[action="/add_expense"]');
        const modalContent = modal.querySelector('.modal-content');

        // Move the expense form into the modal
        if (expenseForm && modalContent) {
            modalContent.appendChild(expenseForm);
        }

        // FAB and Modal logic
        if (fab && modal && closeModalBtn) {
            fab.addEventListener('click', () => { modal.style.display = 'flex'; });
            closeModalBtn.addEventListener('click', () => { modal.style.display = 'none'; });
            window.addEventListener('click', (event) => {
                if (event.target == modal) {
                    modal.style.display = 'none';
                }
            });
        }

        // Bottom navigation logic
        navItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();

                // Deactivate all items and panes
                navItems.forEach(i => i.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

                // Activate the clicked item and its corresponding pane
                this.classList.add('active');
                const targetPaneId = this.getAttribute('data-target');
                const targetPane = document.querySelector(targetPaneId);
                if (targetPane) {
                    targetPane.classList.add('active');
                }
            });
        });

        // Set initial active state based on the default active nav item
        const activeNavItem = document.querySelector('.nav-item.active');
        if (activeNavItem) {
            activeNavItem.click();
        }

        // --- Populate Mobile Dashboard ---
        const flaskData = JSON.parse(document.getElementById('flaskData').textContent);

        // 1. Update summary cards
        const totalIncome = flaskData.income.reduce((acc, item) => acc + item.amount, 0);
        const totalExpenses = flaskData.expenses.reduce((acc, item) => acc + item.amount, 0);
        const totalEMI = flaskData.emis.reduce((acc, item) => acc + item.emi_amount, 0);
        const netSavings = totalIncome - (totalExpenses + totalEMI);

        document.getElementById('mobile-totalIncome').textContent = totalIncome.toFixed(2);
        document.getElementById('mobile-totalExpenses').textContent = totalExpenses.toFixed(2);
        document.getElementById('mobile-totalEMI').textContent = totalEMI.toFixed(2);
        document.getElementById('mobile-netSavings').textContent = netSavings.toFixed(2);

        // 2. Render mobile bar chart
        const mobileCtx = document.getElementById('mobileCategoryBarChart').getContext('2d');
        new Chart(mobileCtx, {
            type: 'bar',
            data: {
                labels: flaskData.doughnut_chart_labels,
                datasets: [
                    {
                        label: 'Budgeted',
                        data: flaskData.doughnut_chart_values,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Spent',
                        data: flaskData.chart_spent_values,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });

        // 3. Fetch and render budget report table
        fetch('/api/budget_report_data')
            .then(response => response.json())
            .then(data => {
                const container = document.getElementById('mobile-budget-report-table-container');
                const table = document.createElement('table');
                table.className = 'budget-report-section'; // Reuse existing style
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Budgeted</th>
                            <th>Spent</th>
                            <th>Diff</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.report_data.map(row => `
                            <tr>
                                <td>${row.category}</td>
                                <td>${row.budgeted.toFixed(2)}</td>
                                <td>${row.spent.toFixed(2)}</td>
                                <td style="color: ${row.difference < 0 ? 'red' : 'green'};">${row.difference.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td><strong>Total</strong></td>
                            <td><strong>${data.totals.budgeted.toFixed(2)}</strong></td>
                            <td><strong>${data.totals.spent.toFixed(2)}</strong></td>
                            <td style="color: ${data.totals.difference < 0 ? 'red' : 'green'};"><strong>${data.totals.difference.toFixed(2)}</strong></td>
                        </tr>
                    </tfoot>
                `;
                container.innerHTML = ''; // Clear previous content
                container.appendChild(table);
            });
    }

    // Initialize mobile view components
    initializeMobileView();
}); // Closing for DOMContentLoaded
