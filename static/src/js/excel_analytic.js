/** @odoo-module **/

import { registry } from '@web/core/registry';
import { Component, onMounted, useState } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";

export class ExcelAnalytic extends Component {
    static template = 'owl.ExcelAnalytic';

    setup() {
        this.action = useService("action");
        this.plans = useState([]); // Stocker les plans et projets

        onMounted(async () => {
            try {
                const plansResponse = await rpc('/dashboard/liste_plans');
                const plans = plansResponse.data.plans;

                // Récupérer les projets associés à chaque plan
                for (const plan of plans) {
                    const projetsResponse = await rpc('/dashboard/liste_projets', { plan_id: plan.id });
                    plan.projets = projetsResponse;

                    // Calcul des totaux pour le footer
                    plan.total_ca_final = plan.projets.reduce((sum, p) => sum + (p.ca_final || 0), 0);
                    plan.total_factures_cumulees = plan.projets.reduce((sum, p) => sum + (p.factures_cumulees || 0), 0);
                    plan.moyenne_avancement = (plan.projets.reduce((sum, p) => sum + (p.pourcentage_avancement || 0), 0) / plan.projets.length).toFixed(2);
                }

                this.plans.push(...plans); 
            } catch (error) {
                console.error('Erreur lors de la récupération des plans et projets:', error);
            }
        });
    }
}

registry.category('actions').add('excel_analytic', ExcelAnalytic);