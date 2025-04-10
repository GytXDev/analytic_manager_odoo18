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
        this.dateFilter = useState({ start: null, end: null });

        onMounted(() => {
            // 1) Valeur par défaut = 'this-year'
            const periodSelector = this.el.querySelector('#period-selector-excel');
            if (periodSelector) {
                periodSelector.value = 'this-year';
            }

            // 2) Appliquer direct => this-year
            this.applyDateFilter('this-year');

            // 3) Installe event listeners
            this._setupEventListeners();
        });
    }

    _setupEventListeners() {

        document.querySelectorAll('.style-switcher-toggler').forEach(el => {
            el.addEventListener('click', () => {
                const styleSwitcher = document.querySelector('.style-switcher');
                if (styleSwitcher) {
                    styleSwitcher.classList.toggle('open');
                }
            });
        });

        // Période
        const periodSelector = this.el.querySelector('#period-selector-excel');
        const dateRangeDiv = this.el.querySelector('#date-range');
        const applyBtn = this.el.querySelector('.btn-submit');

        // Quand la valeur du select change
        if (periodSelector) {
            periodSelector.addEventListener('change', (ev) => {
                const val = ev.target.value;
                if (val === 'custom') {
                    // Montre la div date-range
                    dateRangeDiv.classList.remove('hidden');
                } else {
                    dateRangeDiv.classList.add('hidden');
                    this.applyDateFilter(val);
                }
            });
        }

        // Bouton Appliquer => période custom
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const startInput = this.el.querySelector('#start-date')?.value || null;
                const endInput = this.el.querySelector('#end-date')?.value || null;
                this.applyDateFilter('custom', startInput, endInput);
            });
        }
    }

  
    async applyDateFilter(period, customStart = null, customEnd = null) {
        const today = new Date();
        let startDate, endDate;

        if (period === 'last-month') {
            const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
            const lastMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
            startDate = new Date(year, lastMonth, 1);
            endDate = new Date(year, lastMonth + 1, 0);
        }
        else if (period === 'this-month') {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        }
        else if (period === 'custom' && customStart && customEnd) {
            startDate = new Date(customStart);
            endDate = new Date(customEnd);
        }
        else {
            // this-year => par défaut
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear(), 11, 31);
        }

        // Format AAAA-MM-DD
        const sstr = startDate.toISOString().split('T')[0];
        const estr = endDate.toISOString().split('T')[0];

        this.dateFilter.start = sstr;
        this.dateFilter.end = estr;

        // => on recharge la liste des plans
        await this.loadPlans();
    }

    async loadPlans() {
        try {
            const response = await rpc('/dashboard/liste_plans', {});
            if (!response || response.status !== 'success') {
                console.error('Erreur: /dashboard/liste_plans =>', response);
                return;
            }

            const plans = response.data.plans; 

            for (const plan of plans) {
                const projets = await rpc('/dashboard/liste_projets', {
                    plan_id: plan.id,
                    start: this.dateFilter.start,
                    end: this.dateFilter.end,
                });
                plan.projets = projets; 

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
                plan.moyenne_avancement = parseFloat((plan.projets.reduce((sum, p) => sum + ((p.pourcentage_avancement || 0) * 100), 0) / plan.projets.length).toFixed(2)) || 0;

                // Pourcentage d'avancement
                if (plan.projets.length > 0) {
                    const sumAvt = plan.projets.reduce(
                        (acc, p) => acc + ((p.pourcentage_avancement || 0) * 100), 0
                    );
                    plan.moyenne_avancement = parseFloat((sumAvt / plan.projets.length).toFixed(2)) || 0;
                } else {
                    plan.moyenne_avancement = 0;
                }

                // 4) Récupérer le plan => plan_data
                const planDataResp = await rpc('/dashboard/get_plan', { plan_id: plan.id });
                if (planDataResp.status === 'success') {
                    plan.plan_data = planDataResp.data;
                    plan.plan = planDataResp.data.plan; // => c'est le Plan monétaire
                }

                // 5) Calculer le % d'activité / plan
                plan.pourcentage_activite_plan = plan.plan
                    ? (plan.total_activite_cumulee / plan.plan) * 100
                    : 0;
            }

            // 6) On vide l'ancien tableau => on push
            this.plans.splice(0, this.plans.length, ...plans);

        } catch (error) {
            console.error('Erreur loadPlans:', error);
        }
    }

    async saveProjectData(projet, fieldName, newValue) {
        try {
            await rpc('/dashboard/update_project', {
                id: projet.id_code_project,
                [fieldName]: newValue,
            });
        } catch (error) {
            console.error('Erreur saveProjectData:', error);
        }
    }

    async savePlanData(plan, fieldName, newValue, oldValue) {
        try {
            const res = await rpc('/dashboard/update_plan', {
                plan_id: plan.id,
                plan: newValue,
            });
            if (res.status !== 'success') {
                console.error('Erreur update_plan:', res.message);
            }
        } catch (error) {
            console.error('Erreur savePlanData:', error);
        }
    }

    exportToExcel() {
        window.location.href = '/dashboard/export_to_excel';
    }
}

registry.category('actions').add('excel_analytic', ExcelAnalytic);