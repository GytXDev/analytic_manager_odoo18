/** @odoo-module **/

import { registry } from '@web/core/registry';
import { Component, onMounted, useState } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";

export class ExcelAnalytic extends Component {
    static template = 'owl.ExcelAnalytic';

    setup() {
        this.action = useService("action");
        this.plans = useState([]);

        onMounted(async () => {
            try {
                const plansResponse = await rpc('/dashboard/liste_plans');
                const plans = plansResponse.data.plans;

                // Récupérer les projets associés à chaque plan
                for (const plan of plans) {
                    const projetsResponse = await rpc('/dashboard/liste_projets', { plan_id: plan.id });
                    plan.projets = projetsResponse;

                    // Calcul des totaux pour le footer
                    plan.total_marche_initial = Math.round(plan.projets.reduce((sum, p) => sum + (p.marche_initial || 0), 0));
                    plan.total_ts = Math.round(plan.projets.reduce((sum, p) => sum + (p.ts || 0), 0));
                    plan.total_ca_final = Math.round(plan.projets.reduce((sum, p) => sum + (p.ca_final || 0), 0));
                    plan.total_factures_cumulees = Math.round(plan.projets.reduce((sum, p) => sum + (p.factures_cumulees || 0), 0));
                    plan.total_od_facture = plan.projets.reduce((sum, p) => sum + (p.od_facture || 0), 0);
                    plan.total_non_facture = plan.projets.reduce((sum, p) => sum + (p.non_facture || 0), 0);
                    plan.total_trop_facture = Math.round(plan.projets.reduce((sum, p) => sum + (p.trop_facture || 0), 0));
                    plan.total_activite_cumulee = Math.round(plan.projets.reduce((sum, p) => sum + (p.activite_cumulee || 0), 0));
                    plan.total_debours_comptable_cumule = plan.projets.reduce((sum, p) => sum + (p.debours_comptable_cumule || 0), 0);
                    plan.total_oda_d = plan.projets.reduce((sum, p) => sum + (p.oda_d || 0), 0);
                    plan.total_ffnp = plan.projets.reduce((sum, p) => sum + (p.ffnp || 0), 0);
                    plan.total_stocks = plan.projets.reduce((sum, p) => sum + (p.stocks || 0), 0);
                    plan.total_provisions = plan.projets.reduce((sum, p) => sum + (p.provisions || 0), 0);
                    plan.total_total_debourses = plan.projets.reduce((sum, p) => sum + (p.total_debourses || 0), 0);
                    plan.total_depenses_cumulees = plan.projets.reduce((sum, p) => sum + (p.depenses_cumulees || 0), 0);
                    plan.total_debours_previsionnels = Math.round(plan.projets.reduce((sum, p) => sum + (p.debours_previsionnels || 0), 0));
                    plan.total_resultat_chantier_cumule = Math.round(plan.projets.reduce((sum, p) => sum + (p.resultat_chantier_cumule || 0), 0));
                    plan.moyenne_avancement = parseFloat((plan.projets.reduce((sum, p) => sum + ((p.pourcentage_avancement || 0) * 100), 0) / plan.projets.length).toFixed(2)) || 0;

                    // Récupérer les données du plan
                    const planDataResponse = await rpc('/dashboard/get_plan', {
                        plan_id: plan.id, //ex. 48
                    });

                    if (planDataResponse.status === 'success') {
                        plan.plan_data = planDataResponse.data;
                        plan.plan = planDataResponse.data.plan;
                        // plan.name est l'ID numérique ? on peut stocker plan.name = plan.id pour rester cohérent
                        console.log('Données du plan:', plan.plan_data);
                    } else {
                        console.error('Erreur lors de la récupération des données du plan:', planDataResponse.message);
                    }


                    // Calcul du pourcentage d'activité par rapport au plan
                    plan.pourcentage_activite_plan = plan.plan ? (plan.total_activite_cumulee / plan.plan) * 100 : 0;
                }

                this.plans.push(...plans);

            } catch (error) {
                console.error('Erreur lors de la récupération des plans et projets:', error);
            }
        });
    }

    async saveProjectData(projet, fieldName, newValue) {
        console.log(`ID du projet: ${projet.id_code_project}, Nom du projet: ${projet.code_projet}, Champ modifié: ${fieldName}, Nouvelle valeur: ${newValue}`);
        try {
            await rpc('/dashboard/update_project', {
                id: projet.id_code_project,
                [fieldName]: newValue,
            });
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des données du projet:', error);
        }
    }

    async savePlanData(plan, fieldName, newValue, oldValue) {
        console.log(`ID du plan: ${plan.id}, Champ modifié: ${fieldName}, Ancienne valeur: ${oldValue}, Nouvelle valeur: ${newValue}`);
        try {
            const response = await rpc('/dashboard/update_plan', {
                plan_id: plan.id,  // . 48
                plan: newValue     // . 100005
            });
            if (response.status === 'success') {
                console.log('Plan mis à jour avec succès');
            } else {
                console.error('Erreur lors de la mise à jour du plan:', response.message);
            }
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des données du plan:', error);
        }
    }


    exportToExcel() {
        window.location.href = '/dashboard/export_to_excel';
    }
}

registry.category('actions').add('excel_analytic', ExcelAnalytic);