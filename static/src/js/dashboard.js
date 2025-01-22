/** @odoo-module **/
import { registry } from '@web/core/registry';
import { Component, onMounted } from "@odoo/owl";

export class AnalyticDashboard extends Component {
    static template = 'owl.AnalyticDashboard';

    setup() {
        onMounted(() => {
            const ctx = document.getElementById('budgetChart').getContext('2d');
            new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['LBVM001', 'LBVM002', 'LBVM003'],
                    datasets: [{
                        label: 'Budget (CFA)',
                        data: [15000, 20000, 10000],
                        backgroundColor: ['#42A5F5', '#66BB6A', '#FFA726'],
                        borderWidth: 1,
                    }],
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                    },
                },
            });
        });
    }

}

registry.category('actions').add('dashboard_analytic', AnalyticDashboard);
