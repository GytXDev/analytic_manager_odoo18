/** @odoo-module **/

import { registry } from '@web/core/registry';
import { Component, onMounted, useState } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";

export class ExcelAnalytic extends Component {
    static template = 'owl.ExcelAnalytic';

    setup() {
        this.action = useService("action");
        // Tableau réactif de plans
        this.plans = useState([]);

        onMounted(() => {
            // Installer le listener sur la roue crantée
            document.querySelectorAll('.style-switcher-toggler').forEach(el => {
                el.addEventListener('click', () => {
                    const styleSwitcher = document.querySelector('.style-switcher');
                    if (styleSwitcher) {
                        styleSwitcher.classList.toggle('open');
                    }
                });
            });

            // Installer le listener sur la sélection de période
            const periodSelector = document.getElementById('period-selector-excel');
            if (periodSelector) {
                periodSelector.addEventListener('change', () => this.onPeriodChange());
            }

            // Installer le listener sur le bouton "Appliquer" (période custom)
            const applyBtn = document.querySelector('.btn-submit');
            if (applyBtn) {
                applyBtn.addEventListener('click', () => this.applyCustomPeriod());
            }

            // Charger par défaut "Ce mois" (ou "Cette année", à ta guise)
            periodSelector.value = 'this-month'; // ou 'this-year'
            this.loadThisMonth();
        });
    }

    // ----------------------------------------
    //  MÉTHODES pour charger les plans/périodes
    // ----------------------------------------

    /**
     * Charge les plans (périodisés) pour la plage de dates [start, end].
     * Ensuite, pour chaque plan, on appelle /dashboard/liste_projets 
     * (aussi avec start, end, plan_id).
     */
    async loadPlansWithDates(start, end) {
        try {
            // 1) On nettoie le tableau actuel
            this.plans.splice(0);

            // 2) Appel à /dashboard/liste_plans_periodise
            const response = await rpc('/dashboard/liste_plans_periodise', { start, end });
            if (response.status !== 'success') {
                console.error('Erreur loadPlansPeriodise:', response);
                return;
            }
            const plans = response.data;  // => tableau de {id, name, factures_cumulees, debours_cumule, activite_cumulee, ca_final, depenses_cumulees}

            // 3) Pour chaque plan => on récupère les projets 'périodisés' 
            for (const plan of plans) {
                const projetsResponse = await rpc('/dashboard/liste_projets', {
                    start,
                    end,
                    plan_id: plan.id
                });
                plan.projets = projetsResponse;  // => tableau

                // 4) Calculs "footers" ou totaux => la même logique que tu faisais avant
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
                plan.total_depenses_reelles = plan.projets.reduce((sum, p) => sum + (p.depenses_reelles || 0), 0);
                plan.total_depenses_cumulees = plan.projets.reduce((sum, p) => sum + (p.depenses_cumulees || 0), 0);
                plan.total_reste_a_depense = Math.round(plan.projets.reduce((sum, p) => sum + (p.reste_a_depense || 0), 0));
                plan.total_resultat_chantier_cumule = Math.round(plan.projets.reduce((sum, p) => sum + (p.resultat_chantier_cumule || 0), 0));
                plan.moyenne_avancement = parseFloat((plan.projets.reduce((sum, p) => sum + ((p.pourcentage_avancement || 0) * 100), 0) / (plan.projets.length || 1)).toFixed(2)) || 0;

                // Récupérer plan obj
                const planDataResponse = await rpc('/dashboard/get_plan', { plan_id: plan.id });
                if (planDataResponse.status === 'success') {
                    plan.plan = planDataResponse.data.plan;
                } else {
                    plan.plan = 0;
                }

                plan.pourcentage_activite_plan = plan.plan ? (plan.total_activite_cumulee / plan.plan) * 100 : 0;
            }

            // 5) On met à jour le useState
            this.plans.push(...plans);

        } catch (error) {
            console.error('Erreur dans loadPlansWithDates:', error);
        }
    }

    /**
     * Sur changement de la <select> #period-selector-excel
     */
    onPeriodChange() {
        const value = document.getElementById('period-selector-excel').value;
        if (value === 'this-month') {
            this.loadThisMonth();
        } else if (value === 'last-month') {
            this.loadLastMonth();
        } else if (value === 'this-year') {
            this.loadThisYear();
        } else if (value === 'custom') {
            // On montre le .date-range
            document.getElementById('date-range').classList.remove('hidden');
        }
    }

    applyCustomPeriod() {
        const start = document.getElementById('start-date').value;
        const end = document.getElementById('end-date').value;
        if (start && end) {
            this.loadPlansWithDates(start, end);
        }
    }

    loadThisMonth() {
        // 1er du mois en cours => dernier jour du mois en cours
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const start = new Date(y, m, 1).toISOString().split('T')[0];
        const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
        // On masque la zone custom
        document.getElementById('date-range').classList.add('hidden');
        this.loadPlansWithDates(start, end);
    }

    loadLastMonth() {
        const today = new Date();
        let y = today.getFullYear();
        let m = today.getMonth() - 1;
        if (m < 0) {
            m = 11;
            y -= 1;
        }
        const start = new Date(y, m, 1).toISOString().split('T')[0];
        const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
        document.getElementById('date-range').classList.add('hidden');
        this.loadPlansWithDates(start, end);
    }

    loadThisYear() {
        const today = new Date();
        const y = today.getFullYear();
        const start = new Date(y, 0, 1).toISOString().split('T')[0];
        const end = new Date(y, 11, 31).toISOString().split('T')[0];
        document.getElementById('date-range').classList.add('hidden');
        this.loadPlansWithDates(start, end);
    }

    // ----------------------------------------
    //  Méthodes existantes 
    // ----------------------------------------
    async saveProjectData(projet, fieldName, newValue) {
        console.log(`ID du projet: ${projet.id_code_project}, Champ: ${fieldName}, Valeur: ${newValue}`);
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
        console.log(`ID du plan: ${plan.id}, Champ: ${fieldName}, Ancienne: ${oldValue}, Nouvelle: ${newValue}`);
        try {
            const response = await rpc('/dashboard/update_plan', {
                plan_id: plan.id,
                plan: newValue,
            });
            if (response.status === 'success') {
                console.log('Plan mis à jour avec succès');
            } else {
                console.error('Erreur lors de la mise à jour du plan:', response.message);
            }
        } catch (error) {
            console.error('Erreur lors de la sauvegarde du plan:', error);
        }
    }

    exportToExcel() {
        const start = document.getElementById("start-date").value;
        const end = document.getElementById("end-date").value;
        const queryParams = new URLSearchParams({ start, end }).toString();
        window.location.href = `/dashboard/export_to_excel?${queryParams}`;
    }


}

registry.category('actions').add('excel_analytic', ExcelAnalytic);